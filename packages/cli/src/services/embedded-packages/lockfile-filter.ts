import Debug from 'debug'

import { LockfileRegistryPackage, parseLockfilePackagesContent } from './lockfile-packages.js'
import type { PlannedTarball } from './materializer.js'

const debug = Debug('checkly:cli:services:embedded-packages:lockfile-filter')

export interface TarballLockfileFilterResult {
  kept: PlannedTarball[]
  dropped: PlannedTarball[]
  /** {@link findUnembeddedVersions} of the kept set against the lockfile. */
  unembedded: UnembeddedVersions[]
}

/**
 * Lockfile versions of an embedded package that are not embedded
 * themselves.
 */
export interface UnembeddedVersions {
  name: string
  embedded: string[]
  missing: string[]
}

/**
 * Finds the packages that are embedded in some of their lockfile versions
 * but not all of them, e.g. through a `name@version` pin while a dependency
 * needs another version.
 *
 * Runners answer an embedded package's registry metadata from the code
 * bundle alone, listing only the embedded versions, so an install that
 * resolves through that metadata (npm's) cannot find the missing ones.
 */
export function findUnembeddedVersions (
  tarballs: Pick<PlannedTarball, 'name' | 'version'>[],
  lockfileRegistry: Pick<LockfileRegistryPackage, 'name' | 'version'>[],
): UnembeddedVersions[] {
  const embedded = new Map<string, Set<string>>()
  for (const tarball of tarballs) {
    embedded.set(tarball.name, (embedded.get(tarball.name) ?? new Set()).add(tarball.version))
  }
  const missing = new Map<string, Set<string>>()
  for (const entry of lockfileRegistry) {
    const versions = embedded.get(entry.name)
    if (versions !== undefined && !versions.has(entry.version)) {
      missing.set(entry.name, (missing.get(entry.name) ?? new Set()).add(entry.version))
    }
  }
  return [...missing]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, versions]) => ({
      name,
      embedded: [...embedded.get(name)!],
      missing: [...versions],
    }))
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
 * previous behavior), no unembedded versions are reported, and the
 * failure is debug-logged.
 */
export function filterTarballsByLockfile (
  tarballs: PlannedTarball[],
  lockfileContent: string,
  lockfileName: string,
): TarballLockfileFilterResult {
  let registry: LockfileRegistryPackage[]
  try {
    registry = parseLockfilePackagesContent(lockfileContent, lockfileName).registry
  } catch (err) {
    debug(`Could not parse '${lockfileName}' for tarball filtering, keeping all tarballs: ${err}`)
    return { kept: [...tarballs], dropped: [], unembedded: [] }
  }

  const present = new Set(registry.map(pkg => `${pkg.name}@${pkg.version}`))
  const kept: PlannedTarball[] = []
  const dropped: PlannedTarball[] = []
  for (const tarball of tarballs) {
    if (present.has(`${tarball.name}@${tarball.version}`)) {
      kept.push(tarball)
    } else {
      dropped.push(tarball)
    }
  }
  return { kept, dropped, unembedded: findUnembeddedVersions(kept, registry) }
}
