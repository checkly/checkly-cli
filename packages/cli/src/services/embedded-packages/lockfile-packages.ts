import fs from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'
import JSON5 from 'json5'
import semver from 'semver'

/**
 * One embeddable `name@version` entry from the lockfile: a package that a
 * registry serves as a tarball, with the integrity hash recorded for it.
 */
export interface LockfileRegistryPackage {
  name: string
  version: string
  integrity: string
  /**
   * The full tarball URL when the lockfile records one (npm's `resolved`,
   * pnpm's `resolution.tarball`). When absent, the URL is derived from the
   * registry configuration.
   */
  tarballUrl?: string
}

/**
 * A lockfile entry that cannot be embedded as a registry tarball, kept so
 * that a configured spec matching only such entries gets a precise error
 * instead of a generic "not found in the lockfile".
 */
export interface ExcludedLockfilePackage {
  name: string
  version?: string
  reason: string
  /**
   * Why the entry is excluded, machine-readable: 'workspace' entries are
   * part of the project itself (safe for a wildcard to skip silently),
   * while 'unfetchable' entries (git/file/URL dependencies, or entries
   * without an integrity hash) cannot be embedded but may still be needed
   * at install time.
   */
  kind: 'workspace' | 'unfetchable'
}

export interface LockfilePackages {
  registry: LockfileRegistryPackage[]
  excluded: ExcludedLockfilePackage[]
}

export class UnsupportedLockfileError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'UnsupportedLockfileError'
  }
}

/**
 * Enumerates every package entry in a lockfile, classified into embeddable
 * registry packages and excluded (git/file/link/integrity-less) entries.
 * Supports `pnpm-lock.yaml` (v6/v9) and `package-lock.json` (v2/v3).
 */
export async function loadLockfilePackages (lockfilePath: string): Promise<LockfilePackages> {
  const basename = path.basename(lockfilePath)
  const content = await fs.readFile(lockfilePath, 'utf8')

  switch (basename) {
    case 'pnpm-lock.yaml':
      return parsePnpmLockfilePackages(content)
    case 'package-lock.json':
      return parseNpmLockfilePackages(content)
    default:
      throw new UnsupportedLockfileError(
        `Embedded packages are not supported for '${basename}' lockfiles yet.`
        + ` Only pnpm (pnpm-lock.yaml) and npm (package-lock.json) are currently supported.`,
      )
  }
}

/**
 * Strips a pnpm peer-dependency suffix (`(react@18.2.0)`) from a package
 * key. The v9 `packages` section doesn't use them (they live in
 * `snapshots`), but v6 keys do.
 */
function stripPeerSuffix (key: string): string {
  const cut = key.indexOf('(')
  return cut === -1 ? key : key.slice(0, cut)
}

export function parsePnpmLockfilePackages (content: string): LockfilePackages {
  const data = parseYaml(content)

  // The version can arrive as a number: pnpm writes `lockfileVersion: '9.0'`
  // quoted, but a YAML re-serializer (merge tooling, formatters) may drop
  // the quotes, turning it into the number 9.
  const lockfileVersion = String(data?.lockfileVersion ?? '')
  const lockfileMajor = Number.parseInt(lockfileVersion, 10)
  if (lockfileMajor !== 6 && lockfileMajor !== 9) {
    throw new UnsupportedLockfileError(
      `Embedded packages require pnpm lockfile version 6 or 9`
      + ` (found '${lockfileVersion || 'unknown'}'). Regenerate the lockfile with a supported`
      + ` pnpm version, or update the Checkly CLI if the lockfile is newer.`,
    )
  }

  const result: LockfilePackages = { registry: [], excluded: [] }

  // Workspace-linked packages never appear in the `packages` section — only
  // as `link:` dependencies under `importers`. Record them so a user listing
  // their own workspace package gets a precise "cannot be embedded" error
  // instead of a "not found, check the spelling" one.
  const importers = data?.importers
  if (typeof importers === 'object' && importers !== null) {
    const linkedNames = new Set<string>()
    for (const importer of Object.values<any>(importers)) {
      for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, dep] of Object.entries<any>(importer?.[group] ?? {})) {
          const version = typeof dep === 'string' ? dep : dep?.version
          if (typeof version === 'string' && version.startsWith('link:') && !linkedNames.has(name)) {
            linkedNames.add(name)
            // Same distinction as npm's `link: true` entries: a link whose
            // target escapes the workspace is not part of the project the
            // bundle carries.
            const target = version.slice('link:'.length)
            const escapesWorkspace = target === '..' || target.startsWith('../') || path.isAbsolute(target)
            result.excluded.push({
              name,
              reason: escapesWorkspace
                ? `'${name}' is a local directory link outside the workspace, which cannot be embedded`
                + ` as a registry tarball`
                : `'${name}' is a workspace package, which cannot be embedded as a registry tarball`,
              kind: escapesWorkspace ? 'unfetchable' : 'workspace',
            })
          }
        }
      }
    }
  }

  const packages = data?.packages
  if (typeof packages !== 'object' || packages === null) {
    return result
  }

  const seen = new Set<string>()
  for (const [rawKey, rawEntry] of Object.entries<any>(packages)) {
    // v6 keys have a leading slash (`/name@1.2.3`), v9 keys do not.
    const key = stripPeerSuffix(rawKey.startsWith('/') ? rawKey.slice(1) : rawKey)
    // The name/ref separator is the first `@` past the name. Searching from
    // the front (after the scope, when present) keeps the name intact when
    // the ref itself contains `@`, as git refs do
    // (`foo@git+ssh://git@github.com/...`).
    const searchFrom = key.startsWith('@') ? key.indexOf('/') + 1 : 1
    const separator = searchFrom > 0 ? key.indexOf('@', searchFrom) : -1
    if (separator <= 0) {
      continue
    }
    const name = key.slice(0, separator)
    const ref = key.slice(separator + 1)

    if (seen.has(`${name}@${ref}`)) {
      continue
    }
    seen.add(`${name}@${ref}`)

    // Validate with semver but keep the ref as written: semver.valid()
    // normalizes away build metadata (`1.0.0+sha.abc` → `1.0.0`), which
    // would break both version-pin matching and the derived tarball URL.
    const version = semver.valid(ref) !== null ? ref : null
    if (version === null) {
      result.excluded.push({
        name,
        reason: `'${name}@${ref}' resolves to a git, file or URL dependency,`
          + ` which cannot be embedded as a registry tarball`,
        kind: 'unfetchable',
      })
      continue
    }

    const resolution = rawEntry?.resolution
    const integrity = resolution?.integrity
    if (typeof integrity !== 'string' || integrity === '') {
      result.excluded.push({
        name,
        version,
        reason: `the lockfile records no integrity hash for '${name}@${version}',`
          + ` which is required to embed it`,
        kind: 'unfetchable',
      })
      continue
    }

    const tarball = resolution?.tarball
    result.registry.push({
      name,
      version,
      integrity,
      // Only absolute http(s) URLs are usable for downloading; anything
      // else falls back to the registry-derived URL.
      tarballUrl: typeof tarball === 'string' && /^https?:/.test(tarball) ? tarball : undefined,
    })
  }

  return result
}

export function parseNpmLockfilePackages (content: string): LockfilePackages {
  const data = JSON5.parse(content)

  const lockfileVersion = data?.lockfileVersion
  if (lockfileVersion !== 2 && lockfileVersion !== 3) {
    throw new UnsupportedLockfileError(
      `Embedded packages require npm lockfile version 2 or 3`
      + ` (found '${lockfileVersion ?? 'unknown'}'). Update npm and regenerate the lockfile.`,
    )
  }

  const packages = data?.packages
  const result: LockfilePackages = { registry: [], excluded: [] }
  if (typeof packages !== 'object' || packages === null) {
    return result
  }

  const seen = new Set<string>()
  for (const [key, entry] of Object.entries<any>(packages)) {
    const lastNodeModules = key.lastIndexOf('node_modules/')
    if (lastNodeModules === -1) {
      // The workspace root ('') and workspace member paths are not
      // installable registry artifacts.
      continue
    }
    // Aliased installs record the real package name in the entry; the key
    // segment is the alias.
    const name = typeof entry?.name === 'string'
      ? entry.name
      : key.slice(lastNodeModules + 'node_modules/'.length)

    if (entry?.link === true) {
      // `link: true` covers both workspace members and `file:` directory
      // dependencies. A link whose target escapes the workspace is not
      // part of the project the bundle carries, so a wildcard must not
      // skip it silently.
      const target = typeof entry?.resolved === 'string' ? entry.resolved : ''
      const escapesWorkspace = target === '..' || target.startsWith('../') || path.isAbsolute(target)
      result.excluded.push({
        name: key.slice(lastNodeModules + 'node_modules/'.length),
        reason: escapesWorkspace
          ? `'${key}' is a local directory link outside the workspace, which cannot be embedded`
          + ` as a registry tarball`
          : `'${key}' is a workspace link, which cannot be embedded as a registry tarball`,
        kind: escapesWorkspace ? 'unfetchable' : 'workspace',
      })
      continue
    }

    // As above: validate with semver but keep the version as recorded.
    const version = typeof entry?.version === 'string' && semver.valid(entry.version) !== null
      ? entry.version as string
      : null
    const resolved = typeof entry?.resolved === 'string' ? entry.resolved : undefined

    if (version === null || (resolved !== undefined && !/^https?:/.test(resolved))) {
      result.excluded.push({
        name,
        version: version ?? undefined,
        reason: `'${key}' resolves to a git, file or URL dependency,`
          + ` which cannot be embedded as a registry tarball`,
        kind: 'unfetchable',
      })
      continue
    }

    if (seen.has(`${name}@${version}`)) {
      continue
    }

    const integrity = entry?.integrity
    if (typeof integrity !== 'string' || integrity === '') {
      // Deliberately not marked as seen: an integrity-less copy (typically
      // a nested bundled dependency) must not shadow a proper registry
      // entry of the same name@version appearing later in the map.
      result.excluded.push({
        name,
        version,
        reason: `the lockfile records no integrity hash for '${name}@${version}'`
          + ` (typically a bundled dependency), which is required to embed it`,
        kind: 'unfetchable',
      })
      continue
    }
    seen.add(`${name}@${version}`)

    result.registry.push({
      name,
      version,
      integrity,
      tarballUrl: resolved,
    })
  }

  return result
}
