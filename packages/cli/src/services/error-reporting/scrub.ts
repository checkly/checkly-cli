import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isOwnPath, PACKAGE_ROOT } from './classify.js'
import type { StackFrame } from './sentry-protocol.js'

/** The packages the CLI depends on directly; frames in other packages are the user's. */
export function cliDependencies (packageRoot: string): Set<string> {
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

/**
 * Rewrites a frame's path so it says where in the CLI or its dependencies the
 * code is, and nothing about the machine: no home directory, no user name, no
 * project location. A file of the user's own (a check, the config) is not
 * named at all.
 */
export function scrubFrame (frame: StackFrame, packageRoot: string, dependencies: Set<string>): StackFrame {
  const filename = frame.filename
  if (!filename || filename.startsWith('node:')) {
    return { ...frame, in_app: false }
  }
  if (isOwnPath(filename, packageRoot)) {
    const relative = path.relative(packageRoot, filename).split(path.sep).join('/')
    return { ...frame, filename: `checkly/${relative}`, in_app: true }
  }
  const normalized = filename.split(path.sep).join('/')
  const nodeModules = normalized.lastIndexOf('node_modules/')
  if (nodeModules !== -1) {
    const inPackage = normalized.slice(nodeModules + 'node_modules/'.length)
    if (!dependencies.has(packageName(inPackage))) {
      // A package of the user's, possibly a private one: its name is not sent.
      return { filename: '<dependency>', function: '<redacted>', in_app: false }
    }
    return { ...frame, filename: normalized.slice(nodeModules), in_app: false }
  }
  return { filename: '<project file>', function: '<redacted>', in_app: false }
}

export interface ScrubOptions {
  cwd?: string
  home?: string
  packageRoot?: string
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

// What may follow a path in a message: a separator, a closing bracket or
// quote, or a full stop that ends a sentence.
const PATH_END = '(?=[\\s\'"`():<>,;!\\]}]|\\.(?:\\s|$)|$)'

/**
 * Replaces `dir`, and any path inside it, with `replacement`, which gets the
 * part after `dir`. Only whole path segments match: a working directory `/app`
 * leaves `/application/json` alone.
 */
function replaceDir (
  message: string,
  dir: string,
  replacement: (rest: string) => string,
  platform: NodeJS.Platform,
): string {
  if (!dir || dir.length < 2) return message
  const spellings = pathSpellings(dir.replace(/[\\/]+$/, '')).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?:${spellings})([\\\\/][^\\s'"\`()<>]*)?${PATH_END}`,
    platform === 'win32' ? 'gi' : 'g')
  return message.replace(pattern, (_, rest: string | undefined) => replacement(rest ?? ''))
}

// Characters that end a path in a message. \x60 is a backtick.
const NOT_PATH = String.raw`\s'"\x60()<>`

// Any other absolute path, e.g. a CI checkout outside the working directory
// or a --config file elsewhere, at the start of a word. `https://host/path` is
// a URL and stays.
const ABSOLUTE_PATH = new RegExp(String.raw`(^|[\s'"\x60(=,[{<])(?:` + [
  String.raw`file:\/\/[^${NOT_PATH}]+`,
  String.raw`\/(?=[^/${NOT_PATH}])[^${NOT_PATH}]*`,
  String.raw`[A-Za-z]:[\\/][^${NOT_PATH}]*`,
  // A UNC path, \\server\share.
  String.raw`\\\\[^${NOT_PATH}]+`,
].join('|') + ')', 'g')

// A value given to a name that says it is secret: `token=abc`, `"password": "a b"`,
// also access_token, client_secret, accessToken, x-api-key and the like.
const SECRET_NAME = String.raw`[\w-]*(?:api[_-]?key|token|secret|password|passwd)`
const SECRET_VALUE = new RegExp(String.raw`(${SECRET_NAME}["']?\s*[:=]\s*)("[^"]*"|'[^']*'|["']?[^\s"'&,;]+)`, 'gi')

/** `<redacted>`, inside the quotes the value had. */
function redactValue (value: string): string {
  const quote = value[0]
  if (quote !== '"' && quote !== '\'') return '<redacted>'
  return value.length > 1 && value.endsWith(quote) ? `${quote}<redacted>${quote}` : `${quote}<redacted>`
}

/**
 * Removes what an error message may carry about the user: credentials, and
 * paths that name the user, their project or its files.
 */
export function scrubMessage (
  message: string,
  env: NodeJS.ProcessEnv = process.env,
  {
    cwd = process.cwd(),
    home = os.homedir(),
    packageRoot = PACKAGE_ROOT,
    platform = process.platform,
  }: ScrubOptions = {},
): string {
  let scrubbed = message
    // Checkly API keys.
    .replace(/\bcu_[A-Za-z0-9]{8,}\b/g, '<api key>')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    // Credentials in a URL, up to the last `@` before the host: a password may contain one.
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, '$1<redacted>@')
    .replace(SECRET_VALUE, (_, name: string, value: string) => name + redactValue(value))
  for (const value of [env.CHECKLY_API_KEY, env.CHECKLY_ACCOUNT_ID]) {
    if (value && value.length >= 8) scrubbed = scrubbed.split(value).join('<redacted>')
  }
  // The CLI's own files first, as frames name them: the CLI may be installed
  // in the project or the home directory.
  scrubbed = replaceDir(scrubbed, packageRoot, rest => `checkly${rest.replace(/\\/g, '/')}`, platform)
  // The project next: it is usually inside the home directory.
  scrubbed = replaceDir(scrubbed, cwd, () => '<project file>', platform)
  scrubbed = replaceDir(scrubbed, home, () => '<home file>', platform)
  return scrubbed.replace(ABSOLUTE_PATH, '$1<path>')
}
