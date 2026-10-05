import type { DeployResourceSync, ProjectSync } from '../../rest/projects.js'
import { stripContentHashes } from '../snapshot-service.js'

/**
 * The deploy payload as a Checkly API without the preview endpoint accepts it.
 *
 * `sourceFile`, each snapshot's `sha256` and a Playwright check's
 * `codeBundleSha256` were all added alongside that endpoint. Older deploy
 * schemas reject a key they do not know rather than ignoring it, so a CLI
 * talking to one has to take them back out — otherwise every deploy against
 * such an API fails validation.
 *
 * A snapshot with no storage key is dropped: it describes a file that has not
 * been uploaded, which only a preview accepts, and an older API has no
 * preview. Dropping the entry leaves the check's snapshots as they are rather
 * than failing the deploy.
 *
 * Returns a copy, so the caller can still send the full payload to an API that
 * does support the endpoint.
 *
 * Temporary by design: once every API a supported CLI talks to accepts these
 * fields, this function and its call site go away.
 */
export function stripUnsupportedDeployFields (payload: ProjectSync): ProjectSync {
  return {
    ...payload,
    resources: payload.resources.map(resource => {
      const stripped: DeployResourceSync = { ...resource }
      delete stripped.sourceFile

      if (stripped.payload === null || typeof stripped.payload !== 'object') {
        return stripped
      }

      // The content hashes go the same way they do on a run request.
      stripped.payload = stripContentHashes(stripped.payload)

      const snapshots = stripped.payload.snapshots
      if (Array.isArray(snapshots)) {
        const uploaded = snapshots.filter((snapshot: { key?: string }) => typeof snapshot.key === 'string')
        if (uploaded.length || snapshots.length === 0) {
          // An empty array is meaningful — "this check has no snapshots" — and
          // has always been sent, so it is kept as it is. The key is dropped
          // only when every entry had to go, which would otherwise turn "none
          // of these are uploaded yet" into "this check has none".
          stripped.payload.snapshots = uploaded
        } else {
          delete stripped.payload.snapshots
        }
      }

      return stripped
    }),
  }
}
