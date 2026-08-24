import Debug from 'debug'

import { parseLockfilePackagesContent } from './lockfile-packages.js'
import type { PlannedTarball } from './materializer.js'

const debug = Debug('checkly:cli:services:embedded-packages:lockfile-filter')

export interface TarballLockfileFilterResult {
  kept: PlannedTarball[]
  dropped: PlannedTarball[]
}

/**
 * Splits a planned tarball set by `name@version` presence in a lockfile.
 *
 * Used after the bundled lockfile has been pruned to the code bundle's
 * contents: a pruned lockfile's resolutions are verified to be a subset of
 * the original's (no new entries, no version changes), so filtering the
 * originally planned set by presence is exactly equivalent to re-running
 * spec matching against the pruned lockfile.
 *
 * Fail-safe: if the lockfile content cannot be parsed — unexpected, since
 * a pruned lockfile has already passed the pruner's own parse and
 * verification — every tarball is kept (the pre-filter superset is the
 * previous behavior) and the failure is debug-logged.
 */
export function filterTarballsByLockfile (
  tarballs: PlannedTarball[],
  lockfileContent: string,
  lockfileName: string,
): TarballLockfileFilterResult {
  let present: Set<string>
  try {
    const packages = parseLockfilePackagesContent(lockfileContent, lockfileName)
    present = new Set(packages.registry.map(pkg => `${pkg.name}@${pkg.version}`))
  } catch (err) {
    debug(`Could not parse '${lockfileName}' for tarball filtering, keeping all tarballs: ${err}`)
    return { kept: [...tarballs], dropped: [] }
  }

  const kept: PlannedTarball[] = []
  const dropped: PlannedTarball[] = []
  for (const tarball of tarballs) {
    if (present.has(`${tarball.name}@${tarball.version}`)) {
      kept.push(tarball)
    } else {
      dropped.push(tarball)
    }
  }
  return { kept, dropped }
}
