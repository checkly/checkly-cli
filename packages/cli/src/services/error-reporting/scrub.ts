import os from 'node:os'
import path from 'node:path'

import { frameFile, isOwnPath, PACKAGE_ROOT } from './classify.js'
import type { StackFrame } from './sentry-protocol.js'

// Where V8 places a built-in's frame, as in `Array.map (<anonymous>)` and
// `Promise.all (index 0)`.
const BUILT_IN_LOCATION = /^(?:<anonymous>|native|index \d+)$/

/**
 * Rewrites a frame's path so it says where in the CLI or its dependencies the
 * code is, and nothing about the machine. A file of the user's own (a check,
 * the config) is not named at all.
 */
export function scrubFrame (frame: StackFrame, packageRoot: string): StackFrame {
  if (!frame.filename || frame.filename.startsWith('node:') || BUILT_IN_LOCATION.test(frame.filename)) {
    return { ...frame, in_app: false }
  }
  // For an eval, the file that ran it, as isCliBug judges it.
  const filename = frameFile(frame.filename)
  if (isOwnPath(filename, packageRoot)) {
    const relative = path.relative(packageRoot, filename).split(path.sep).join('/')
    return { ...frame, filename: `checkly/${relative}`, in_app: true }
  }
  const normalized = filename.split(path.sep).join('/')
  const nodeModules = normalized.lastIndexOf('node_modules/')
  if (nodeModules !== -1) {
    return { ...frame, filename: normalized.slice(nodeModules), in_app: false }
  }
  return { filename: '<project file>', in_app: false }
}

export interface ScrubOptions {
  cwd?: string
  home?: string
  packageRoot?: string
}

/**
 * Removes Checkly API keys, auth headers and URL passwords from an error
 * message, and the CLI's, the project's and the home directory's location.
 */
export function scrubMessage (
  message: string,
  { cwd = process.cwd(), home = os.homedir(), packageRoot = PACKAGE_ROOT }: ScrubOptions = {},
): string {
  let scrubbed = message
    // Checkly user (cu_) and service (sv_) API keys.
    .replace(/\b(?:cu|sv)_[A-Za-z0-9]{8,}\b/g, '<api key>')
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 <redacted>')
    .replace(/\b(\w+:\/\/)[^\s/@]+@/g, '$1<redacted>@')
  // The CLI first: it may be installed in the project or the home directory,
  // and the project is usually inside the home directory.
  for (const [dir, replacement] of [[packageRoot, 'checkly'], [cwd, '<project>'], [home, '~']]) {
    // A root, `/` or `C:\`, would match every path.
    if (dir.replace(/[\\/:]+$/, '').length > 1) scrubbed = scrubbed.split(dir).join(replacement)
  }
  return scrubbed
}
