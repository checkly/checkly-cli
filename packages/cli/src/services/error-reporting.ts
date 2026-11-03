import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import Debug from 'debug'
import type { Event, Exception, StackFrame } from '@sentry/core'

import { assignProxy } from './proxy.js'
import { isEnvFlagSet } from '../helpers/cli-mode.js'
import { isDevelopmentBuild } from './project-cli.js'

const debug = Debug('checkly:error-reporting')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// This file compiles to dist/services/error-reporting.js.
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..')

// Written to the package root by the release workflow before `pnpm pack`, which
// rebuilds dist. Builds without it (local checkouts, forks, tests) report nothing.
const DSN_FILE = path.join(PACKAGE_ROOT, 'error-reporting.json')

// The runtime errors a bug in the CLI's own code throws. Every other error is
// either one the CLI throws on purpose to tell the user something (invalid
// input, a failed deploy, an API error) or one from the user's system (files,
// network), and none of those are bugs in the CLI.
const REPORTED_ERROR_NAMES = new Set(['TypeError', 'ReferenceError', 'RangeError'])

// TypeErrors Node raises for input the user gave the CLI, e.g. a malformed
// CHECKLY_API_URL or proxy URL: the CLI's code is fine, the value is not.
const USER_INPUT_ERROR_CODES = new Set(['ERR_INVALID_URL', 'ERR_INVALID_URL_SCHEME'])

// How deep to look into `cause` for the error a wrapper hides, e.g. the
// TypeError in `Error loading file '…'`.
const MAX_CAUSE_DEPTH = 5

const SEND_TIMEOUT_MS = 3000

export interface ErrorReportContext {
  /** The CLI version, `this.config.version`. */
  version: string
  /** The oclif command id, e.g. `deploy` or `checks:list`. */
  command?: string
  /** The detected CLI mode: interactive, ci or agent. */
  cliMode?: string
  /** Whether a command caught and printed the error, rather than it ending the command. */
  handled?: boolean
}

export interface ErrorReportOptions {
  /** The DSN to report to. Defaults to the one in `dsnFile`. */
  dsn?: string
  /** The file the release workflow writes the DSN to. */
  dsnFile?: string
  /** The CLI's install directory; frames inside it are the CLI's own code. */
  packageRoot?: string
  env?: NodeJS.ProcessEnv
}

/** Whether the user turned error reporting off with `CHECKLY_NO_ERROR_REPORTING` or `DO_NOT_TRACK`. */
export function isErrorReportingDisabled (env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnvFlagSet(env.CHECKLY_NO_ERROR_REPORTING) || isEnvFlagSet(env.DO_NOT_TRACK)
}

function readReleaseDsn (file: string): string | undefined {
  try {
    const { dsn } = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof dsn === 'string' && dsn ? dsn : undefined
  } catch {
    return undefined
  }
}

/** The environment a release reports as, from its version. */
export function releaseEnvironment (version: string): string {
  if (/^\d+\.\d+\.\d+$/.test(version)) return 'production'
  if (/-rc\.\d+$/.test(version)) return 'rc'
  // Prereleases (`-prerelease-<sha>`) and anything else. Canary and local
  // builds never report (isDevelopmentBuild).
  return 'prerelease'
}

function realpath (p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

function isInside (file: string, dir: string): boolean {
  const relative = path.relative(dir, file)
  return !!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Whether `file` is one of the CLI's own files, not one of its dependencies. */
function isOwnPath (file: string, packageRoot: string): boolean {
  return isInside(file, packageRoot) && !isInside(file, path.join(packageRoot, 'node_modules'))
}

/**
 * Rewrites a frame's path so it says where in the CLI or its dependencies the
 * code is, and nothing about the machine: no home directory, no user name, no
 * project location. A file of the user's own (a check, the config) is not
 * named at all.
 */
/** The packages the CLI depends on directly; frames in other packages are the user's. */
function cliDependencies (packageRoot: string): Set<string> {
  try {
    const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    return new Set(Object.keys(dependencies))
  } catch {
    return new Set()
  }
}

/** `axios` for `node_modules/axios/lib/x.js`, `@scope/name` for a scoped package. */
function packageName (afterNodeModules: string): string {
  const [first, second] = afterNodeModules.split('/')
  return first.startsWith('@') ? `${first}/${second}` : first
}

function scrubFrame (frame: StackFrame, packageRoot: string, dependencies: Set<string>): StackFrame {
  const filename = frame.filename
  if (!filename || filename.startsWith('node:')) {
    return { ...frame, in_app: false }
  }
  if (isOwnPath(filename, packageRoot)) {
    const relative = path.relative(packageRoot, filename).split(path.sep).join('/')
    return { ...frame, filename: `checkly/${relative}`, abs_path: undefined, module: undefined, in_app: true }
  }
  const normalized = filename.split(path.sep).join('/')
  const nodeModules = normalized.lastIndexOf('node_modules/')
  if (nodeModules !== -1) {
    const inPackage = normalized.slice(nodeModules + 'node_modules/'.length)
    if (!dependencies.has(packageName(inPackage))) {
      // A package of the user's, possibly a private one: its name is not sent.
      return { filename: '<dependency>', function: '<redacted>', in_app: false }
    }
    return {
      ...frame,
      filename: normalized.slice(nodeModules),
      abs_path: undefined,
      module: undefined,
      in_app: false,
    }
  }
  return { filename: '<project file>', function: '<redacted>', in_app: false }
}

export interface ScrubOptions {
  cwd?: string
  home?: string
  platform?: NodeJS.Platform
}

function escapeRegExp (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The ways a message may spell `dir`: native, with forward slashes, and as a file URL. */
function pathSpellings (dir: string): string[] {
  const forward = dir.replace(/\\/g, '/')
  const url = `file://${forward.startsWith('/') ? '' : '/'}${encodeURI(forward)}`
  return [...new Set([dir, forward, url])]
}

/**
 * Replaces `dir`, and any path inside it, with `replacement`. Only whole path
 * segments match: a working directory `/app` leaves `/application/json` alone.
 */
function replaceDir (message: string, dir: string, replacement: string, platform: NodeJS.Platform): string {
  if (!dir || dir.length < 2) return message
  const spellings = pathSpellings(dir.replace(/[\\/]+$/, '')).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?:${spellings})(?:[\\\\/][^\\s'"\`()<>]*)?(?=[\\s'"\`():<>,;]|$)`,
    platform === 'win32' ? 'gi' : 'g')
  return message.replace(pattern, replacement)
}

/**
 * Removes what an error message may carry about the user: credentials, and
 * paths that name the user, their project or its files.
 */
export function scrubMessage (
  message: string,
  env: NodeJS.ProcessEnv = process.env,
  { cwd = process.cwd(), home = os.homedir(), platform = process.platform }: ScrubOptions = {},
): string {
  let scrubbed = message
    // Checkly API keys.
    .replace(/\bcu_[A-Za-z0-9]{8,}\b/g, '<api key>')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    // Credentials in a URL.
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, '$1<redacted>@')
    // Also access_token, client_secret, accessToken, x-api-key and the like.
    .replace(/([\w-]*(?:api[_-]?key|token|secret|password|passwd))(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
      '$1$2<redacted>')
  for (const value of [env.CHECKLY_API_KEY, env.CHECKLY_ACCOUNT_ID]) {
    if (value && value.length >= 8) scrubbed = scrubbed.split(value).join('<redacted>')
  }
  // The project first: it is usually inside the home directory.
  scrubbed = replaceDir(scrubbed, cwd, '<project file>', platform)
  return replaceDir(scrubbed, home, '<home file>', platform)
}

/**
 * The exceptions of `err` and its causes, innermost cause first, as Sentry
 * expects them. Only the name, the scrubbed message and the scrubbed frames
 * are kept: an error's other properties (an axios error's request config with
 * its auth headers, for one) are never sent.
 */
async function toExceptions (
  err: Error,
  packageRoot: string,
  env: NodeJS.ProcessEnv,
  handled: boolean,
): Promise<Exception[]> {
  const { createStackParser, exceptionFromError } = await import('@sentry/core')
  const { nodeStackLineParser } = await import('@sentry/core/server')
  const stackParser = createStackParser(nodeStackLineParser())
  const dependencies = cliDependencies(packageRoot)

  const exceptions: Exception[] = []
  let current: unknown = err
  while (current instanceof Error && exceptions.length < MAX_CAUSE_DEPTH) {
    const exception = exceptionFromError(stackParser, current)
    exceptions.unshift({
      type: current.name,
      value: scrubMessage(current.message, env),
      stacktrace: exception.stacktrace && {
        frames: exception.stacktrace.frames?.map(frame => scrubFrame(frame, packageRoot, dependencies)),
      },
      mechanism: { type: 'generic', handled },
    })
    current = current.cause
  }
  return exceptions
}

/**
 * Whether `err` is a bug in the CLI's own code: one of the runtime error types
 * a bug throws, raised in a file of the CLI. A TypeError in a user's check
 * file, which the CLI loads and runs in its own process, is the user's.
 */
export function isCliBug (err: unknown, packageRoot: string = PACKAGE_ROOT): boolean {
  if (!(err instanceof Error) || !REPORTED_ERROR_NAMES.has(err.name)) return false
  if (USER_INPUT_ERROR_CODES.has((err as NodeJS.ErrnoException).code ?? '')) return false
  const root = realpath(packageRoot)
  const innermost = (err.stack ?? '')
    .split('\n')
    .map(line => line.match(/^\s*at (?:.*? \()?(.+?):\d+:\d+\)?$/)?.[1])
    .find(file => file && !file.startsWith('node:'))
  if (!innermost) return false
  return isOwnFile(innermost, root)
}

/** Whether a stack location (a path, or an ES module's file URL) is a CLI file outside its node_modules. */
function isOwnFile (location: string, root: string): boolean {
  let file: string
  try {
    // ES modules name their files as URLs: file:///C:/... on Windows, with spaces as %20.
    file = location.startsWith('file:') ? fileURLToPath(location) : location
  } catch {
    return false
  }
  return isOwnPath(file, root)
}

/**
 * The CLI bug in `err` or in its causes: the CLI wraps many errors in a plain
 * Error with the original as `cause`. Only that error is reported, not the
 * wrapper, whose message may quote a user's file and its stack.
 */
export function findCliBug (err: unknown, packageRoot: string = PACKAGE_ROOT): Error | undefined {
  let current = err
  for (let depth = 0; current instanceof Error && depth < MAX_CAUSE_DEPTH; depth++) {
    if (isCliBug(current, packageRoot)) return current
    current = current.cause
  }
  return undefined
}

/** The Sentry event for `err`. Exported for tests. */
export async function buildErrorEvent (
  err: Error,
  context: ErrorReportContext,
  { packageRoot = PACKAGE_ROOT, env = process.env }: ErrorReportOptions = {},
): Promise<Event> {
  const { uuid4 } = await import('@sentry/core')
  const runtime = process.versions.bun ? 'bun' : process.versions.deno ? 'deno' : 'node'
  return {
    event_id: uuid4(),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: context.handled ? 'error' : 'fatal',
    release: `checkly@${context.version}`,
    environment: releaseEnvironment(context.version),
    exception: { values: await toExceptions(err, realpath(packageRoot), env, !!context.handled) },
    tags: {
      ...(context.command && { command: context.command }),
      ...(context.cliMode && { cli_mode: context.cliMode }),
    },
    contexts: {
      os: { name: process.platform },
      runtime: { name: runtime, version: process.versions[runtime] ?? process.version },
      device: { arch: process.arch },
    },
    // Only what is set above is sent: no computer name, user, locale, working
    // directory, command arguments or environment variables.
  }
}

let reported = false
let noted: { error: Error, handled: boolean } | undefined

/**
 * Remembers the first CLI bug of the run, for `reportNotedCliError` to send
 * when the command ends. For errors a command catches and prints itself
 * instead of throwing, e.g. `deploy` and `test`, which never reach
 * `BaseCommand.catch`.
 */
export function noteCliError (
  err: unknown,
  { handled = true, packageRoot = PACKAGE_ROOT }: { handled?: boolean, packageRoot?: string } = {},
): void {
  try {
    if (noted) return
    const error = findCliBug(err, packageRoot)
    if (error) noted = { error, handled }
  } catch {
    // Never let reporting change how a command fails.
  }
}

/** Sends the error `noteCliError` remembered, if any. Never throws. */
export async function reportNotedCliError (
  context: () => Omit<ErrorReportContext, 'handled'>,
  options: ErrorReportOptions = {},
): Promise<void> {
  if (noted) await reportCliError(noted.error, { ...context(), handled: noted.handled }, options)
}

/**
 * Reports `err`, or the CLI bug among its causes, to Checkly when it is a bug
 * in the CLI, the build is a release and the user has not turned reporting
 * off. Reports at most one error per run, waits at most a few seconds, and
 * never throws: a failed report must not change how the command fails.
 */
export async function reportCliError (
  err: unknown,
  context: ErrorReportContext,
  options: ErrorReportOptions = {},
): Promise<void> {
  try {
    const env = options.env ?? process.env
    const dsn = options.dsn ?? readReleaseDsn(options.dsnFile ?? DSN_FILE)
    const packageRoot = options.packageRoot ?? PACKAGE_ROOT
    if (reported || !dsn || isDevelopmentBuild(context.version) || isErrorReportingDisabled(env)) return
    const bug = findCliBug(err, packageRoot)
    if (!bug) return
    reported = true

    const { createEventEnvelope, getEnvelopeEndpointWithUrlEncodedAuth, makeDsn, serializeEnvelope } =
      await import('@sentry/core')
    const parsedDsn = makeDsn(dsn)
    if (!parsedDsn) return
    const event = await buildErrorEvent(bug, context, { packageRoot, env })
    const envelope = createEventEnvelope(event, parsedDsn, { sdk: { name: 'checkly-cli', version: context.version } })
    const url = getEnvelopeEndpointWithUrlEncodedAuth(parsedDsn)
    const { status } = await axios.post(url, serializeEnvelope(envelope), assignProxy(url, {
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      timeout: SEND_TIMEOUT_MS,
      // `timeout` only limits the wait for a response; this also ends a
      // connection that never opens, e.g. behind a proxy that drops it.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      validateStatus: () => true,
    }))
    if (status >= 200 && status < 300) {
      debug('Reported %s as %s', bug.name, event.event_id)
    } else {
      debug('The ingest rejected the report of %s with status %d', bug.name, status)
    }
  } catch (reportError) {
    debug('Could not report the error: %O', reportError)
  }
}

/** Lets the next report go out again. For tests. */
export function resetErrorReporting (): void {
  reported = false
  noted = undefined
}
