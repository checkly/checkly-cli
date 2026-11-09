import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import Debug from 'debug'

import { assignProxy } from '../proxy.js'
import { isEnvFlagSet } from '../../helpers/cli-mode.js'
import { isDevelopmentBuild } from '../project-cli.js'
import config from '../config.js'
import { findCliBug, mayBeCliBug, PACKAGE_ROOT } from './classify.js'
import { buildErrorEvent, type ErrorReportContext } from './event.js'
import { envelopeEndpoint, serializeEventEnvelope } from './sentry-protocol.js'

const debug = Debug('checkly:error-reporting')

// Written to the package root by the release workflow before `pnpm pack`, which
// rebuilds dist. Builds without it (local checkouts, forks, tests) report nothing.
const DSN_FILE = path.join(PACKAGE_ROOT, 'error-reporting.json')

// One small POST; the error is printed after it, so the user waits this long at most.
const SEND_TIMEOUT_MS = 1500

// Enough to get past the ordinary errors a command prints before its bug.
const MAX_NOTED_ERRORS = 5

export interface ErrorReportOptions {
  /** The DSN to report to. Defaults to the one in `dsnFile`. */
  dsn?: string
  /** The file the release workflow writes the DSN to. */
  dsnFile?: string
  /** The CLI's install directory; frames inside it are the CLI's own code. */
  packageRoot?: string
  env?: NodeJS.ProcessEnv
  /** Values to remove from the report. Defaults to the credentials and account the CLI holds. */
  secrets?: string[]
}

interface Target {
  dsn: string
  packageRoot: string
  env: NodeJS.ProcessEnv
  secrets: string[]
}

let reported = false
let noted: Array<{ error: unknown, handled: boolean }> = []
let defaultOptions: ErrorReportOptions = {}

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

/** Where to send a report, or `undefined` when this run must not send one. */
function reportTarget (version: string, options: ErrorReportOptions): Target | undefined {
  const env = options.env ?? process.env
  if (reported || isDevelopmentBuild(version) || isErrorReportingDisabled(env)) return undefined
  const dsn = options.dsn ?? readReleaseDsn(options.dsnFile ?? DSN_FILE)
  if (!dsn) return undefined
  return {
    dsn,
    env,
    packageRoot: options.packageRoot ?? PACKAGE_ROOT,
    secrets: options.secrets ?? config.getCredentialValues(),
  }
}

async function send (bug: Error, context: ErrorReportContext, target: Target): Promise<void> {
  const { dsn, packageRoot, env, secrets } = target
  reported = true
  const url = envelopeEndpoint(dsn)
  if (!url) return
  const event = buildErrorEvent(bug, context, { packageRoot, env, secrets })
  const envelope = serializeEventEnvelope(event, { name: 'checkly-cli', version: context.version })
  const { status } = await axios.post(url, envelope, assignProxy(url, {
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
}

/**
 * Remembers an error for `reportNotedCliError` to check and send when the
 * command ends. For errors a command catches and prints itself instead of
 * throwing, e.g. `deploy` and `test`, which never reach `BaseCommand.catch`.
 */
export function noteCliError (err: unknown, { handled = true }: { handled?: boolean } = {}): void {
  try {
    if (noted.length < MAX_NOTED_ERRORS && mayBeCliBug(err)) noted.push({ error: err, handled })
  } catch {
    // Never let reporting change how a command fails.
  }
}

/**
 * Sends the first noted error that is a CLI bug, if any. Reports at most one
 * error per run, waits at most a few seconds, and never throws: a failed
 * report must not change how the command fails.
 */
export async function reportNotedCliError (
  context: () => Omit<ErrorReportContext, 'handled'>,
  options: ErrorReportOptions = defaultOptions,
): Promise<void> {
  try {
    if (noted.length === 0) return
    const base = context()
    const target = reportTarget(base.version, options)
    if (!target) return
    for (const { error, handled } of noted) {
      const bug = findCliBug(error, target.packageRoot)
      if (bug) return await send(bug, { ...base, handled }, target)
    }
  } catch (reportError) {
    debug('Could not report the error: %O', reportError)
  }
}

/**
 * Sets the options `reportNotedCliError` uses when it is given none, as in
 * `BaseCommand.finally`. For tests, which have no release DSN file.
 */
export function setDefaultErrorReportOptions (options: ErrorReportOptions): void {
  defaultOptions = options
}

/** Lets the next report go out again. For tests. */
export function resetErrorReporting (): void {
  reported = false
  noted = []
  defaultOptions = {}
}
