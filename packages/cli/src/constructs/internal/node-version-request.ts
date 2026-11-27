import type { Construct } from '../construct.js'

/** The Node.js version a Playwright check asks for, and where it came from. */
export interface RequestedNodeVersion {
  version: string
  /** The version file or field it was detected in, or the `Engine.node()` that sets it. */
  source: string
}

/**
 * The Node.js version each validated Playwright check asks for, kept outside
 * the check so that it is neither part of the payload nor of the public API.
 */
const requests = new WeakMap<Construct, RequestedNodeVersion>()

export function recordRequestedNodeVersion (check: Construct, request: RequestedNodeVersion): void {
  requests.set(check, request)
}

/** The Node.js version `check` asks for, once it has been validated. */
export function requestedNodeVersion (check: Construct): RequestedNodeVersion | undefined {
  return requests.get(check)
}
