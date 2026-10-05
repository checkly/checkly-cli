/**
 * Leaf paths whose difference is a CLI upgrade changing how a payload is
 * spelled, not a user editing a construct: private locations moving from an
 * inline list to assignment resources, `doubleCheck` becoming a retry
 * strategy, alert settings and parallel scheduling moving to the v2 group
 * defaults. After such an upgrade every affected resource reports a
 * code-origin change once and rewrites its snapshot; rather than render a
 * property diff of two spellings of the same thing, the preview says so.
 *
 * An enumerated list, extended with each shape change. It carries no copy of
 * any backend default: membership is by path alone, which is why the
 * renderer consults it only once the two renderings agree — a user editing
 * one of these properties differs in the construct, and prints as that.
 */
const SHAPE_CHANGE_PATHS: ReadonlySet<string> = new Set([
  '/privateLocations',
  '/doubleCheck',
  '/retryStrategy',
  '/alertSettings',
  '/useGlobalAlertSettings',
  '/runParallel',
])

/** Whether a reported change path is one of the known shape changes, or lies under one. */
export function isShapeChangePath (path: string): boolean {
  if (SHAPE_CHANGE_PATHS.has(path)) {
    return true
  }
  for (const known of SHAPE_CHANGE_PATHS) {
    if (path.startsWith(`${known}/`)) {
      return true
    }
  }
  return false
}
