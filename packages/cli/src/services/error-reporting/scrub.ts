import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { frameFile, isOwnPath, PACKAGE_ROOT } from './classify.js'
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
 * `synthesize` for `AcmeCheck.synthesize`. V8 names a method by the class of
 * the object it was called on, which may be a user's subclass of a construct;
 * the file and line already say which code it is.
 */
function withoutReceiver (name: string | undefined): string | undefined {
  return name?.replace(/^[^\s[]*\./, '')
}

// Where V8 places a built-in's frame, as in `Array.map (<anonymous>)` and
// `Promise.all (index 0)`. Code without a file of its own, such as
// `evalmachine.<anonymous>` for a vm script, is not a built-in: it may be a user's.
const BUILT_IN_LOCATION = /^(?:<anonymous>|native|index \d+)$/

/**
 * Rewrites a frame's path so it says where in the CLI or its dependencies the
 * code is, and nothing about the machine: no home directory, no user name, no
 * project location. A file of the user's own (a check, the config) is not
 * named at all.
 */
export function scrubFrame (frame: StackFrame, packageRoot: string, dependencies: Set<string>): StackFrame {
  if (!frame.filename || frame.filename.startsWith('node:') || BUILT_IN_LOCATION.test(frame.filename)) {
    return { ...frame, function: withoutReceiver(frame.function), in_app: false }
  }
  // For an eval, the file that ran it, as isCliBug judges it.
  const filename = frameFile(frame.filename)
  if (isOwnPath(filename, packageRoot)) {
    const relative = path.relative(packageRoot, filename).split(path.sep).join('/')
    return { ...frame, filename: `checkly/${relative}`, function: withoutReceiver(frame.function), in_app: true }
  }
  const normalized = filename.split(path.sep).join('/')
  const nodeModules = normalized.lastIndexOf('node_modules/')
  if (nodeModules !== -1) {
    const inPackage = normalized.slice(nodeModules + 'node_modules/'.length)
    if (!dependencies.has(packageName(inPackage))) {
      // A package of the user's, possibly a private one: its name is not sent.
      return { filename: '<dependency>', function: '<redacted>', in_app: false }
    }
    const file = normalized.slice(nodeModules)
    return { ...frame, filename: file, function: withoutReceiver(frame.function), in_app: false }
  }
  return { filename: '<project file>', function: '<redacted>', in_app: false }
}

export interface ScrubOptions {
  cwd?: string
  home?: string
  packageRoot?: string
  platform?: NodeJS.Platform
  /** Values to remove wherever they appear, e.g. the stored API key and account. */
  secrets?: string[]
}

function escapeRegExp (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The ways a message may spell `dir`: native, with forward slashes, and as a file URL. */
function pathSpellings (dir: string): string[] {
  const forward = dir.replace(/\\/g, '/')
  // As pathToFileURL spells it, which also encodes `#` and `?`.
  const encoded = encodeURI(forward).replace(/[?#]/g, encodeURIComponent)
  const url = `file://${forward.startsWith('/') ? '' : '/'}${encoded}`
  return [...new Set([dir, forward, url])]
}

// What may follow a path in a message: a separator, a closing bracket or
// quote, or a full stop that ends a sentence.
const PATH_END = '(?=[\\s\'"`():<>,;!\\]}]|\\.(?:\\s|$)|$)'

// Characters that end a path in a message. \x60 is a backtick.
const NOT_PATH = String.raw`\s'"\x60()<>`

// A path may go on after a space, as in `/Users/Ann Lee/proj`: a word that
// follows it and holds a path separator is taken as part of it. A path that
// ends in a word without one, as `/Users/Ann Lee` does, cannot be told apart
// from the text after it.
const PATH_CONTINUATION = String.raw`(?: [^${NOT_PATH}\\/]*[\\/][^${NOT_PATH}]*)*`

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
  const trimmed = dir.replace(/[\\/]+$/, '')
  // A root, `/` or `C:\`, holds every path; the general rule replaces those.
  // Matching `C:` alone would also hit words such as `Topic:`.
  if (trimmed.length < 2 || /^[A-Za-z]:$/.test(trimmed)) return message
  const spellings = pathSpellings(trimmed).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?:${spellings})([\\\\/][^${NOT_PATH}]*${PATH_CONTINUATION})?${PATH_END}`,
    platform === 'win32' ? 'gi' : 'g')
  return message.replace(pattern, (_, rest: string | undefined) => replacement(rest ?? ''))
}

// Any other absolute path, e.g. a CI checkout outside the working directory
// or a --config file elsewhere, at the start of a word. `https://host/path` is
// a URL and stays.
// After `>` and `]` too: a path may follow a placeholder, as in
// `<redacted>/private/x` once a secret in the middle of it was removed.
const ABSOLUTE_PATH = new RegExp(String.raw`(^|[\s'"\x60(=,[{<>\]:;|])(?:` + [
  String.raw`file:\/\/[^${NOT_PATH}]+`,
  String.raw`\/(?=[^/${NOT_PATH}])[^${NOT_PATH}]*`,
  String.raw`[A-Za-z]:[\\/][^${NOT_PATH}]*`,
  // A UNC path, \\server\share.
  String.raw`\\\\[^${NOT_PATH}]+`,
].join('|') + ')' + PATH_CONTINUATION, 'g')

// A value given to a name that says it is secret: `token=abc`, `"password": "a b"`,
// also access_token, client_secret, accessToken, x-api-key and the like.
const SECRET_NAME = String.raw`[\w-]*(?:api[_-]?key|token|secret|password|passwd)`
// Only at the start of a word: tried at every position of a long word, the
// leading [\w-]* would take time quadratic in its length.
const SECRET_VALUE = new RegExp(String.raw`((?<![\w-])${SECRET_NAME}["']?\s*[:=]\s*)("[^"]*"|'[^']*'|["']?[^\s"'&,;]+)`, 'gi')

// Where a URL starts: a scheme that is not the end of a longer word.
const URL_START = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\//gi

// A URL with an `@` somewhere, which may carry a user and password. Before
// the last `@`, any character may be part of a password; after it, a quote or
// bracket ends the URL.
const URL_WITH_AT = new RegExp(URL_START.source + String.raw`\S*@[^\s'"\x60<>]*`, 'gi')

// Punctuation after a URL that belongs to the sentence: `(see http://…).`
const TRAILING_PUNCTUATION = /[).,;:!\]}]+$/

/** Where the next URL in `text` starts after its first character, or -1. */
function nextUrlStart (text: string): number {
  for (const match of text.matchAll(URL_START)) {
    if (match.index > 0) return match.index
  }
  return -1
}

/**
 * A URL with credentials rebuilt from its scheme and host alone, and one that
 * cannot be parsed withheld: a password may hold any character, so no pattern
 * finds where it ends. A URL without credentials stays, but a URL inside it,
 * or right after it, may have some: `?next=http://user:pw@host`. A loop, not
 * recursion: a word may hold thousands of URL starts.
 */
function withoutUrlCredentials (text: string): string {
  let kept = ''
  let rest = text
  while (rest.includes('@')) {
    const punctuation = TRAILING_PUNCTUATION.exec(rest)?.[0] ?? ''
    const url = rest.slice(0, rest.length - punctuation.length)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return `${kept}${url.slice(0, url.indexOf('://'))}://<redacted>${punctuation}`
    }
    if (parsed.username || parsed.password) {
      return `${kept}${parsed.protocol}//<redacted>@${parsed.host}${punctuation}`
    }
    const next = nextUrlStart(rest)
    if (next === -1) break
    kept += rest.slice(0, next)
    rest = rest.slice(next)
  }
  return kept + rest
}

// Longer messages are cut before they are scrubbed, which bounds the work of
// the patterns. CLI bugs have short messages; a long one quotes data.
const MAX_MESSAGE_LENGTH = 8192

/**
 * `message` cut at the last space within the limit. Every word kept is whole,
 * so no part of a secret is left that its pattern no longer recognises.
 */
function truncate (message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message
  const cut = message.slice(0, MAX_MESSAGE_LENGTH + 1).search(/\s\S*$/)
  return `${cut > 0 ? message.slice(0, cut) : ''} <truncated>`
}

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
    secrets = [],
  }: ScrubOptions = {},
): string {
  let scrubbed = truncate(message)
    // Checkly user (cu_) and service (sv_) API keys.
    .replace(/\b(?:cu|sv)_[A-Za-z0-9]{8,}\b/g, '<api key>')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 <redacted>')
    .replace(URL_WITH_AT, withoutUrlCredentials)
    .replace(SECRET_VALUE, (_, name: string, value: string) => name + redactValue(value))
  for (const value of [env.CHECKLY_API_KEY, env.CHECKLY_ACCOUNT_ID, ...secrets]) {
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
