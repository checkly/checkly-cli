import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isInside } from '../../constructs/internal/declaring-file.js'
import { parseStack, type StackFrame } from './sentry-protocol.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// This file compiles to dist/services/error-reporting/classify.js.
export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..')

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

export function realpath (p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

/** Whether `file` is one of the CLI's own files, not one of its dependencies. */
export function isOwnPath (file: string, packageRoot: string): boolean {
  return isInside(packageRoot, file) && !isInside(path.join(packageRoot, 'node_modules'), file)
}

/** Whether `err` is of a type a CLI bug throws. Looks only at the error, not at its stack. */
function isBugType (err: unknown): err is Error {
  return err instanceof Error
    && REPORTED_ERROR_NAMES.has(err.name)
    && !USER_INPUT_ERROR_CODES.has((err as NodeJS.ErrnoException).code ?? '')
}

/** `err` and its causes, outermost first, at most MAX_CAUSE_DEPTH of them. */
export function* errorChain (err: unknown): Generator<Error> {
  let current = err
  for (let depth = 0; current instanceof Error && depth < MAX_CAUSE_DEPTH; depth++) {
    yield current
    current = current.cause
  }
}

/**
 * Whether `err` or one of its causes is of a type a CLI bug throws. Cheap, so
 * it can run where an error is printed; `findCliBug`, which reads the stack,
 * decides.
 */
export function mayBeCliBug (err: unknown): boolean {
  for (const error of errorChain(err)) {
    if (isBugType(error)) return true
  }
  return false
}

// Code run through eval or `new Function` names its frame
// `eval at load (/path/file.js:1:2), <anonymous>`, which parseStack keeps as
// the filename. The file in the innermost parentheses is the one that ran it.
const EVAL_ORIGIN = /\(([^()]+):\d+:\d+\)/

/** The file a frame's code is in, as a path: for an eval, the file that ran it. */
export function frameFile (filename: string): string {
  const file = filename.startsWith('eval at ') ? EVAL_ORIGIN.exec(filename)?.[1] ?? filename : filename
  try {
    return file.startsWith('file:') ? fileURLToPath(file) : file
  } catch {
    return file
  }
}

/** Whether `file` names a file: not `<anonymous>`, `index 0` or a `node:` module. */
function isFile (file: string): boolean {
  return path.isAbsolute(file) || path.win32.isAbsolute(file)
}

/**
 * The file of the frame that threw: the innermost one in a file. A built-in
 * that throws, e.g. `'x'.repeat(-1)`, adds a frame like `String.repeat
 * (<anonymous>)` and Node's own modules add `node:` frames; the code that
 * called them decides.
 */
function throwingFile (frames: StackFrame[]): string | undefined {
  // parseStack orders frames outermost first.
  for (let i = frames.length - 1; i >= 0; i--) {
    const filename = frames[i].filename
    const file = filename && frameFile(filename)
    if (file && isFile(file)) return file
  }
  return undefined
}

/**
 * Whether `err` is a bug in the CLI's own code: one of the runtime error types
 * a bug throws, raised in a file of the CLI. A TypeError in a user's check
 * file, which the CLI loads and runs in its own process, is the user's.
 * `packageRoot` is a real path, as the stack's files are.
 */
export function isCliBug (err: unknown, packageRoot: string = PACKAGE_ROOT): boolean {
  if (!isBugType(err)) return false
  const file = throwingFile(parseStack(err.stack ?? ''))
  return !!file && isOwnPath(file, packageRoot)
}

/**
 * The CLI bug in `err` or in its causes: the CLI wraps many errors in a plain
 * Error with the original as `cause`. Only that error is reported, not the
 * wrapper, whose message may quote a user's file and its stack.
 */
export function findCliBug (err: unknown, packageRoot: string = PACKAGE_ROOT): Error | undefined {
  for (const error of errorChain(err)) {
    if (isCliBug(error, packageRoot)) return error
  }
  return undefined
}
