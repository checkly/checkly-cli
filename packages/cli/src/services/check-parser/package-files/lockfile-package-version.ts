import semver from 'semver'
import { parse as parseYaml } from 'yaml'
import JSON5 from 'json5'

/**
 * One candidate importer to resolve a package version against, identified by
 * its path relative to the workspace root (POSIX, `.` for the root) and the
 * version range it declares for the package, if any.
 */
export interface ImporterCandidate {
  relPath: string
  declaredRange?: string
}

/**
 * Describes the package we want to resolve a version for.
 *
 * `importers` is the chain of candidate importers ordered from nearest (the
 * workspace member that owns the Playwright config, or a deeper directory) up
 * to the workspace root. This mirrors Node's upward module resolution: a
 * package required from a deep directory resolves to the first `node_modules`
 * found walking up the tree, which may belong to a physically-enclosing
 * workspace member rather than the root. Each lockfile format uses this chain
 * differently (see the individual parsers).
 */
export interface LockfilePackageQuery {
  /** The package whose version we want, e.g. `@playwright/test`. */
  packageName: string
  /** Candidate importers, ordered nearest → workspace root. */
  importers: ImporterCandidate[]
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
 * version). lockfileVersion 1 (npm 6) only has a nested `dependencies` tree and
 * is unsupported — we return `undefined` so the caller falls back.
 *
 * The map keys are physical node_modules paths, so resolution is a single
 * lexical walk up the path segments of the *nearest* importer — that walk
 * already visits every ancestor up to the root and finds the enclosing copy.
 * The walk, not the candidate list, is the resolution mechanism; iterating the
 * other candidates would be redundant.
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

  const nearest = query.importers[0]
  if (nearest === undefined) {
    return undefined
  }

  const rel = nearest.relPath === '.' ? '' : nearest.relPath
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
 *
 * We walk the importer chain nearest → root and return the first importer that
 * declares the package. With pnpm's default isolated linker a package required
 * from a non-declaring member resolves up the filesystem to the nearest
 * enclosing member that does declare it — which is exactly the nearest
 * declaring importer in this chain. (The `node-linker=hoisted` and PnP layouts
 * can diverge; those degrade to the caller's node_modules fallback.)
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

  for (const candidate of query.importers) {
    const importer = importers[candidate.relPath]
    if (typeof importer !== 'object' || importer === null) {
      continue
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
  }

  return undefined
}

/**
 * Resolves a package version from a bun text lockfile (`bun.lock`).
 *
 * bun.lock is JSONC. The `packages` map keys the hoisted copy by bare name
 * (`@playwright/test`) and a member's pinned override by the declaring member's
 * *name* (`some-package/@playwright/test`). Member names are recorded in
 * `workspaces.<relPath>.name` (the root uses the `""` key). Each entry's value
 * is an array whose first element is `name@version`.
 *
 * Resolution is two-phase: probe every candidate's member-scoped key nearest →
 * root first, and only fall back to the hoisted key once all member-scoped
 * probes miss. A naive per-candidate "first hit wins" would return the hoisted
 * version as soon as the nearest (non-declaring) member is reached, masking a
 * deeper member's pinned override that Node would actually resolve.
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

  const workspaces = typeof data.workspaces === 'object' && data.workspaces !== null
    ? data.workspaces
    : {}

  const prefix = `${query.packageName}@`
  const readVersion = (key: string): string | undefined => {
    const entry = packages[key]
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].startsWith(prefix)) {
      return entry[0].slice(prefix.length)
    }
    return undefined
  }

  // Phase 1: member-scoped overrides, nearest → root.
  for (const candidate of query.importers) {
    const wsKey = candidate.relPath === '.' ? '' : candidate.relPath
    const name = workspaces[wsKey]?.name
    if (typeof name !== 'string') {
      continue
    }
    const version = readVersion(`${name}/${query.packageName}`)
    if (version !== undefined) {
      return version
    }
  }

  // Phase 2: the hoisted copy.
  return readVersion(query.packageName)
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
 * Picks the best version from the yarn resolutions matching our package, given
 * a single declared range.
 *
 * yarn keys resolutions by descriptor, and a workspace may resolve several
 * versions of the same package (one per declared range). We prefer the entry
 * whose declared range exactly matches — that's the precise answer, since yarn
 * records the descriptor verbatim from package.json. If there's no exact match
 * we fall back to the highest version that satisfies the range, and finally to
 * the sole entry when the package resolves to just one version.
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
 * Resolves a version from yarn resolutions across the importer chain.
 *
 * A yarn lockfile records no importer/placement information — only descriptor →
 * version resolutions — so we can only disambiguate by declared range. We try
 * each importer's declared range nearest → root, and finally fall back to the
 * sole resolution when only one version exists. This is best-effort; the
 * caller's node_modules fallback covers cases yarn's lockfile can't express.
 */
function resolveYarnVersion (resolutions: YarnResolution[], query: LockfilePackageQuery): string | undefined {
  for (const candidate of query.importers) {
    if (candidate.declaredRange === undefined) {
      continue
    }
    const version = pickYarnVersion(resolutions, candidate.declaredRange)
    if (version !== undefined) {
      return version
    }
  }

  return pickYarnVersion(resolutions, undefined)
}

/**
 * Parses the resolutions for `packageName` from a yarn berry (v2+) `yarn.lock`,
 * which is YAML. Entries are keyed by one or more comma-separated descriptors
 * (`"@playwright/test@npm:^1.40.0"`) and carry a `version` field.
 */
function parseYarnBerryResolutions (content: string, packageName: string): YarnResolution[] {
  const data = parseYaml(content)
  if (typeof data !== 'object' || data === null) {
    return []
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
        parsed !== undefined && parsed.name === packageName)
      .map(parsed => parsed.range)
    if (ranges.length > 0) {
      resolutions.push({ ranges, version })
    }
  }

  return resolutions
}

/**
 * Parses the resolutions for `packageName` from a yarn classic (v1) `yarn.lock`.
 *
 * The classic format is not YAML. Each resolution is a block whose header is an
 * unindented, comma-separated list of (optionally quoted) descriptors ending in
 * `:`, followed by indented fields including `version "x.y.z"`.
 */
function parseYarnClassicResolutions (content: string, packageName: string): YarnResolution[] {
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
        parsed !== undefined && parsed.name === packageName)
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

  return resolutions
}

/**
 * Resolves a package version from a `yarn.lock`, dispatching to the classic or
 * berry parser. Berry lockfiles carry a `__metadata:` block; classic ones do
 * not. The lockfile is parsed once, then resolved across the importer chain.
 */
export function parseYarnLockfileVersion (
  content: string,
  query: LockfilePackageQuery,
): string | undefined {
  const resolutions = /^__metadata:/m.test(content)
    ? parseYarnBerryResolutions(content, query.packageName)
    : parseYarnClassicResolutions(content, query.packageName)

  return resolveYarnVersion(resolutions, query)
}
