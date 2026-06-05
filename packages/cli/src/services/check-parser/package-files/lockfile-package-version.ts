import semver from 'semver'
import { parse as parseYaml } from 'yaml'
import JSON5 from 'json5'

/**
 * Describes the package we want to resolve a version for, scoped to a single
 * workspace member (importer). Different lockfile formats key their data
 * differently, so a query carries everything the various parsers might need:
 *
 * - npm and pnpm key by the importer's path relative to the workspace root.
 * - bun keys nested entries by the importer's package *name*, which it stores
 *   in the lockfile keyed by relative path, so the bun parser can look it up.
 * - yarn (classic and berry) has no importer concept in its lockfile; it keys
 *   resolutions by descriptor (`name@range`). We disambiguate using the range
 *   the importer declared in its package.json.
 */
export interface LockfilePackageQuery {
  /** The package whose version we want, e.g. `@playwright/test`. */
  packageName: string
  /** Importer path relative to the workspace root, POSIX, `.` for the root. */
  importerRelPath: string
  /** The version range the importer declared for the package, if any. */
  declaredRange?: string
}

/**
 * Strips a pnpm peer-dependency suffix from a resolved version.
 *
 * pnpm encodes the peer set a dependency was resolved against directly into
 * the version string. Lockfile v6/v9 use parenthesized suffixes
 * (`1.40.0(react@18.2.0)`), while v5 used underscore suffixes
 * (`1.40.0_react@16.14.0`). A plain version never contains either character,
 * so cutting at the first one yields the bare version.
 */
function stripPnpmPeerSuffix (version: string): string {
  const cut = version.search(/[(_]/)
  return cut === -1 ? version : version.slice(0, cut)
}

/**
 * Resolves a package version from an npm `package-lock.json`.
 *
 * Only lockfileVersion 2 and 3 are supported, which key the flat `packages`
 * map by node_modules path relative to the workspace root (e.g.
 * `node_modules/@playwright/test` when hoisted, or
 * `packages/a/node_modules/@playwright/test` when a member pins a conflicting
 * version). We mimic Node's resolution by checking the importer's own
 * node_modules first, then walking up to the root. lockfileVersion 1 (npm 6)
 * only has a nested `dependencies` tree and is unsupported — we return
 * `undefined` so the caller falls back to reading node_modules.
 */
export function parseNpmLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const data = JSON5.parse(content)
  const packages = data?.packages
  if (typeof packages !== 'object' || packages === null) {
    return undefined
  }

  const rel = query.importerRelPath === '.' ? '' : query.importerRelPath
  const segments = rel === '' ? [] : rel.split('/')

  // From the importer directory up to the workspace root, try each ancestor's
  // node_modules. The first match wins, matching Node's upward resolution.
  for (let depth = segments.length; depth >= 0; depth--) {
    const prefix = segments.slice(0, depth).join('/')
    const key = `${prefix ? `${prefix}/` : ''}node_modules/${query.packageName}`
    const entry = packages[key]
    if (entry && typeof entry.version === 'string') {
      return entry.version
    }
  }

  return undefined
}

/**
 * Resolves a package version from a `pnpm-lock.yaml`.
 *
 * pnpm records a per-importer resolved version under
 * `importers.<relPath>.{dependencies,devDependencies,optionalDependencies}`.
 * The value is a bare version string (lockfile v5) or a `{ specifier, version }`
 * map (v6/v9). Catalog entries still carry a resolved `version`, so they need
 * no special handling. The version may carry a pnpm peer suffix, which we
 * strip.
 */
export function parsePnpmLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const data = parseYaml(content)
  const importers = data?.importers
  if (typeof importers !== 'object' || importers === null) {
    return undefined
  }

  const importer = importers[query.importerRelPath]
  if (typeof importer !== 'object' || importer === null) {
    return undefined
  }

  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const dep = importer[group]?.[query.packageName]
    if (dep === undefined) {
      continue
    }
    const version = typeof dep === 'string' ? dep : dep?.version
    if (typeof version === 'string') {
      return stripPnpmPeerSuffix(version)
    }
  }

  return undefined
}

/**
 * Resolves a package version from a bun text lockfile (`bun.lock`).
 *
 * bun.lock is JSONC. The `packages` map keys entries by package name, prefixed
 * with the consuming workspace member's *name* when a member pins a version
 * distinct from the hoisted one (e.g. `pkg-a/@playwright/test`). The member
 * name is recorded in `workspaces.<relPath>.name` (the root uses the `""` key).
 * Each entry's value is an array whose first element is `name@version`.
 *
 * The binary lockfile (`bun.lockb`) is not handled here; the caller skips it.
 */
export function parseBunLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const data = JSON5.parse(content)
  const packages = data?.packages
  if (typeof packages !== 'object' || packages === null) {
    return undefined
  }

  // Resolve the importer's package name so we can probe a member-scoped entry
  // before the hoisted one.
  let importerName: string | undefined
  const workspaces = data.workspaces
  if (typeof workspaces === 'object' && workspaces !== null) {
    const wsKey = query.importerRelPath === '.' ? '' : query.importerRelPath
    importerName = workspaces[wsKey]?.name
  }

  const candidates: string[] = []
  if (importerName) {
    candidates.push(`${importerName}/${query.packageName}`)
  }
  candidates.push(query.packageName)

  const prefix = `${query.packageName}@`
  for (const key of candidates) {
    const entry = packages[key]
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].startsWith(prefix)) {
      return entry[0].slice(prefix.length)
    }
  }

  return undefined
}

interface YarnResolution {
  /** The declared ranges (npm protocol stripped) that resolve to `version`. */
  ranges: string[]
  version: string
}

/**
 * Parses a single yarn descriptor (`name@range`) into its name and range.
 *
 * Handles scoped names (the `@` prefix) by splitting on the last `@`. For yarn
 * berry, the range carries a protocol (`npm:^1.40.0`); we strip the `npm:`
 * protocol so it compares against the plain range from package.json. Non-npm
 * protocols (`patch:`, `workspace:`, `portal:`, …) are left intact and simply
 * won't match an npm range.
 */
function parseYarnDescriptor (descriptor: string): { name: string, range: string } | undefined {
  const at = descriptor.lastIndexOf('@')
  if (at <= 0) {
    return undefined
  }
  const name = descriptor.slice(0, at)
  let range = descriptor.slice(at + 1)
  const colon = range.indexOf(':')
  if (colon !== -1 && range.slice(0, colon) === 'npm') {
    range = range.slice(colon + 1)
  }
  return { name, range }
}

/**
 * Picks the best version from the yarn resolutions matching our package.
 *
 * yarn keys resolutions by descriptor, and a workspace may resolve several
 * versions of the same package (one per declared range). We prefer the entry
 * whose declared range exactly matches the importer's — that's the precise
 * answer, since yarn records the descriptor verbatim from package.json. If
 * there's no exact match we fall back to the highest version that satisfies
 * the range, and finally to the sole entry when the package resolves to just
 * one version.
 */
function pickYarnVersion (resolutions: YarnResolution[], declaredRange?: string): string | undefined {
  if (resolutions.length === 0) {
    return undefined
  }

  if (declaredRange !== undefined) {
    const exact = resolutions.find(resolution => resolution.ranges.includes(declaredRange))
    if (exact) {
      return exact.version
    }

    const satisfying = resolutions.filter(resolution => {
      try {
        return semver.satisfies(resolution.version, declaredRange)
      } catch {
        return false
      }
    })
    if (satisfying.length > 0) {
      return satisfying.reduce((best, candidate) =>
        semver.gt(candidate.version, best.version) ? candidate : best,
      ).version
    }
  }

  if (resolutions.length === 1) {
    return resolutions[0].version
  }

  return undefined
}

/**
 * Resolves a package version from a yarn berry (v2+) `yarn.lock`, which is YAML.
 *
 * Entries are keyed by one or more comma-separated descriptors
 * (`"@playwright/test@npm:^1.40.0"`) and carry a `version` field. We collect
 * the declared ranges per resolved version and disambiguate by the importer's
 * declared range.
 */
function parseYarnBerryLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const data = parseYaml(content)
  if (typeof data !== 'object' || data === null) {
    return undefined
  }

  const resolutions: YarnResolution[] = []
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === '__metadata') {
      continue
    }
    const version = (value as { version?: unknown })?.version
    if (typeof version !== 'string') {
      continue
    }
    const ranges = key
      .split(',')
      .map(descriptor => parseYarnDescriptor(descriptor.trim()))
      .filter((parsed): parsed is { name: string, range: string } =>
        parsed !== undefined && parsed.name === query.packageName)
      .map(parsed => parsed.range)
    if (ranges.length > 0) {
      resolutions.push({ ranges, version })
    }
  }

  return pickYarnVersion(resolutions, query.declaredRange)
}

/**
 * Resolves a package version from a yarn classic (v1) `yarn.lock`.
 *
 * The classic format is not YAML. Each resolution is a block whose header is an
 * unindented, comma-separated list of (optionally quoted) descriptors ending in
 * `:`, followed by indented fields including `version "x.y.z"`.
 */
function parseYarnClassicLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const resolutions: YarnResolution[] = []
  const lines = content.split(/\r?\n/)

  let index = 0
  while (index < lines.length) {
    const line = lines[index]

    // A header is an unindented, non-comment line ending with ':'.
    const isHeader = line.length > 0
      && !line.startsWith(' ')
      && !line.startsWith('#')
      && line.trimEnd().endsWith(':')

    if (!isHeader) {
      index++
      continue
    }

    const header = line.trimEnd().slice(0, -1)
    const ranges = header
      .split(',')
      .map(descriptor => parseYarnDescriptor(descriptor.trim().replace(/^"|"$/g, '')))
      .filter((parsed): parsed is { name: string, range: string } =>
        parsed !== undefined && parsed.name === query.packageName)
      .map(parsed => parsed.range)

    // Scan the indented body for the version field, stopping at the next
    // header (the next unindented, non-empty line).
    let version: string | undefined
    index++
    while (index < lines.length) {
      const bodyLine = lines[index]
      if (bodyLine.length > 0 && !bodyLine.startsWith(' ')) {
        break
      }
      const match = bodyLine.match(/^\s+version:?\s+"?([^"]+?)"?\s*$/)
      if (match) {
        version = match[1]
      }
      index++
    }

    if (ranges.length > 0 && version !== undefined) {
      resolutions.push({ ranges, version })
    }
  }

  return pickYarnVersion(resolutions, query.declaredRange)
}

/**
 * Resolves a package version from a `yarn.lock`, dispatching to the classic or
 * berry parser. Berry lockfiles carry a `__metadata:` block; classic ones do
 * not.
 */
export function parseYarnLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  if (/^__metadata:/m.test(content)) {
    return parseYarnBerryLockfileVersion(content, query)
  }
  return parseYarnClassicLockfileVersion(content, query)
}
