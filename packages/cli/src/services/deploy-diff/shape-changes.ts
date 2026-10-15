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
 *
 * A path that is a shape change for one resource type may be an ordinary
 * property of another (`/description` on a dashboard against a check), so
 * the paths a type adds are listed under that type.
 */
const SHAPE_CHANGE_PATHS: ReadonlySet<string> = new Set([
  '/privateLocations',
  '/doubleCheck',
  '/retryStrategy',
  '/alertSettings',
  '/useGlobalAlertSettings',
  '/runParallel',
])

// Keys the construct used to leave out of the payload when unset and now
// sends with its default or cleared value, so that a deploy resets what the
// web app set. The first plan after the upgrade reports each as a
// code-origin change from an absent leaf. A private location's proxy URL is
// sensitive: the API reports its first null plainly only when the row holds
// no proxy, so a proxy the deploy clears still renders as a secret change.
const SHAPE_CHANGE_PATHS_BY_TYPE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['alert-channel', new Set(['/sendRecovery', '/sendFailure', '/sendDegraded', '/sslExpiry', '/sslExpiryThreshold'])],
  ['private-location', new Set(['/proxyUrl'])],
  ['dashboard', new Set(['/customUrl', '/customDomain', '/logo', '/favicon', '/link', '/header', '/description'])],
])

/** Whether a reported change path is one of the known shape changes for the resource type, or lies under one. */
export function isShapeChangePath (path: string, type: string): boolean {
  const known = [...SHAPE_CHANGE_PATHS, ...(SHAPE_CHANGE_PATHS_BY_TYPE.get(type) ?? [])]
  return known.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}
