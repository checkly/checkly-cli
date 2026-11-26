import type { Construct } from '../../constructs/construct.js'
import { requestedNodeVersion, type RequestedNodeVersion } from '../../constructs/internal/node-version-request.js'
import type { DiffEntry } from '../../rest/projects.js'

/** The Node.js version a deployed Playwright check asks for, and where it came from. */
export interface NodeVersionRequest extends RequestedNodeVersion {
  logicalId: string
}

/** The Node.js requests of the validated Playwright checks among `checks`, in their order. */
export function nodeVersionRequests (checks: Iterable<Construct>): NodeVersionRequest[] {
  const requests: NodeVersionRequest[] = []
  for (const check of checks) {
    const request = requestedNodeVersion(check)
    if (request !== undefined) {
      requests.push({ logicalId: check.logicalId, ...request })
    }
  }
  return requests
}

/**
 * One line per distinct request, source and release, in the order the checks
 * come: `Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.`
 * The release is the `resolvedNodeVersion` Checkly reported on the check's
 * diff entry. Without one (an API that predates the field, or none resolved)
 * the line ends after the source.
 */
export function nodeVersionLines (requests: readonly NodeVersionRequest[], diff: readonly DiffEntry[]): string[] {
  const releases = new Map<string, string>()
  for (const entry of diff) {
    if (entry.type === 'check' && typeof entry.resolvedNodeVersion === 'string') {
      releases.set(entry.logicalId, entry.resolvedNodeVersion)
    }
  }
  const lines = new Set<string>()
  for (const { logicalId, version, source } of requests) {
    const release = releases.get(logicalId)
    lines.add(release === undefined
      ? `Node.js ${version} (${source}).`
      : `Node.js ${version} (${source}) runs ${release}.`)
  }
  return [...lines]
}
