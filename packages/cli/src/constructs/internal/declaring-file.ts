import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Finds the user file that declares a construct by looking at the call
 * stack of the construct's constructor.
 *
 * The project parser loads check files one at a time, but a module a check
 * file imports is evaluated once, during its first importer's load, and then
 * served from the module cache. A construct declared in such a module (a
 * shared alerts file, a group definition no check glob matches) therefore
 * cannot be attributed by "the file being loaded right now": that would name
 * whichever importer happened to load first. The call stack does not have
 * this problem: the frame right below the constructor chain is the code that
 * ran `new SomeCheck(...)`, wherever it lives.
 *
 * Frames are considered from the innermost outwards:
 * - the constructor chain of the construct's own class hierarchy is skipped
 *   (one frame per class from `Construct` down to the class being
 *   instantiated, subclasses in the user's code included), so the file that
 *   ran `new` counts rather than the file declaring a subclass;
 * - frames without a file, `node:` internals and eval'd code are skipped;
 * - frames inside the CLI's own code (`dist/` in the published package,
 *   `src/` when run from source) are skipped, so the parser and helpers such
 *   as a group's `testMatch` expansion never count either;
 * - the first remaining frame is the answer, unless it sits under a
 *   `node_modules` directory: then no user code created the construct (the
 *   CLI created it itself and the next frame out is the command runner, or a
 *   test runner did), and the caller falls back to the parser's current file.
 *
 * Both jiti (TypeScript check files) and Node's own ESM loader report the
 * original file, as a plain path or a `file://` URL. A module the loader
 * resolved itself is reported at its physical location (symlinks resolved);
 * the file the loader was asked to load keeps the path it was given, which is
 * why the project parser hands it physical paths.
 *
 * Accepted limitations: a construct created inside a helper function or a
 * wrapper class in the user's code is attributed to the helper's file; a
 * construct library installed under `node_modules` (rather than linked from
 * workspace source) falls back to the parser's current file; and V8 emits a
 * single frame for a run of two or more consecutive subclasses without an
 * explicit constructor, so behind such a run one more frame is skipped than
 * the chain has classes, which only matters when that frame is a wrapper
 * class's constructor.
 */

/**
 * The directory holding the CLI's own code: `dist/` in the published package,
 * `src/` when running from source. Frames under it belong to the CLI, not to
 * the user's project.
 */
const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Frames to capture. The CLI's own constructor chain is at most five frames
 * deep (`CheckGroupV1` creating a `BrowserCheck` for a `testMatch` entry);
 * the rest is headroom for subclasses and helper functions in the user's
 * code.
 */
const STACK_DEPTH = 32

const NODE_MODULES_SEGMENT = /[\\/]node_modules[\\/]/

/** What the frame filter needs to know about a call site. */
export interface Frame {
  fileName?: string | null
  isConstructor: boolean
}

export interface DeclaringFileOptions {
  /** The directory holding the CLI's own code. */
  ownRoot: string
  /**
   * The number of classes from `Construct` down to the class being
   * instantiated; each one contributes a constructor frame at the top of
   * the stack.
   */
  constructorChainLength: number
  /**
   * For tests only, so Windows frames can be exercised on other platforms.
   */
  platformPath?: path.PlatformPath
}

function isInside (root: string, file: string, platformPath: path.PlatformPath): boolean {
  const relative = platformPath.relative(root, file)
  const escapes = relative === '..' || relative.startsWith(`..${platformPath.sep}`)
  return !escapes && !platformPath.isAbsolute(relative)
}

/**
 * Picks the declaring file out of a list of stack frames, innermost first.
 * See the module description for the rules.
 */
export function declaringFileFromFrames (
  frames: Frame[],
  { ownRoot, constructorChainLength, platformPath = path }: DeclaringFileOptions,
): string | undefined {
  // The chain is skipped by count, not by looking for constructor frames:
  // a wrapper class in the user's code that creates a construct in its own
  // constructor is a helper, and its frame must count. The flag only guards
  // against a chain shorter than expected.
  let skipped = 0
  for (const { fileName, isConstructor } of frames) {
    if (skipped < constructorChainLength && isConstructor) {
      skipped++
      continue
    }
    if (!fileName || fileName.startsWith('node:')) {
      continue
    }
    let file: string
    if (fileName.startsWith('file:')) {
      try {
        file = fileURLToPath(fileName, { windows: platformPath === path.win32 })
      } catch {
        continue
      }
    } else if (platformPath.isAbsolute(fileName)) {
      file = fileName
    } else {
      // `<anonymous>`, `eval at ...` and similar.
      continue
    }
    if (isInside(ownRoot, file, platformPath)) {
      continue
    }
    return NODE_MODULES_SEGMENT.test(file) ? undefined : file
  }
  return undefined
}

/**
 * The user file that declares the construct whose constructor is running, or
 * `undefined` when no user code is on the stack (the CLI or a test runner
 * created the construct) or the runtime does not expose structured stack
 * frames.
 *
 * `Error.prepareStackTrace` is replaced for the duration of a single
 * synchronous `new Error()` so V8 hands over call sites instead of a
 * formatted string, then restored; only file names and the constructor flag
 * are read, which no source map changes.
 *
 * @param constructorChainLength see {@link DeclaringFileOptions}
 */
export function captureDeclaringFile (constructorChainLength: number): string | undefined {
  const { prepareStackTrace, stackTraceLimit } = Error
  let callSites: unknown
  try {
    Error.prepareStackTrace = (_error, sites) => sites
    Error.stackTraceLimit = STACK_DEPTH
    callSites = new Error().stack
  } finally {
    Error.prepareStackTrace = prepareStackTrace
    Error.stackTraceLimit = stackTraceLimit
  }
  if (!Array.isArray(callSites)) {
    return undefined
  }
  const frames = (callSites as NodeJS.CallSite[]).map(site => ({
    fileName: site.getFileName(),
    isConstructor: site.isConstructor(),
  }))
  return declaringFileFromFrames(frames, { ownRoot: OWN_ROOT, constructorChainLength })
}
