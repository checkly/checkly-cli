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

/**
 * The dependency graph the lockfile records between registry entries, in
 * `name@version` key space. Used by detection to propagate publicness: a
 * package depended on by a provably public package is assumed public
 * without a lookup. Missing edges are always safe — they only cause more
 * lookups, never a wrong verdict — so anything not resolvable to a
 * registry entry (links, git/file/URL dependencies) is simply absent.
 */
export interface LockfileDependencyGraph {
  /** `name@version` → the `name@version` entries it depends on. */
  edges: Map<string, Set<string>>
  /**
   * `name@version` keys of the workspace's direct dependencies (of every
   * importer/workspace member). Nothing public vouches for these — the
   * project itself is private — so they are always verified, never
   * assumed.
   */
  roots: Set<string>
}

export interface LockfilePackages {
  registry: LockfileRegistryPackage[]
  excluded: ExcludedLockfilePackage[]
  graph: LockfileDependencyGraph
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
export async function loadLockfilePackages (lockfilePath: string, content?: string): Promise<LockfilePackages> {
  const basename = path.basename(lockfilePath)
  content ??= await fs.readFile(lockfilePath, 'utf8')

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

/**
 * Splits a `name@ref` key at the separator between the name and the ref,
 * tolerating `@` inside the ref itself (git URLs). Undefined when the key
 * has no separator past the name.
 */
function splitNameAndRef (key: string): { name: string, ref: string } | undefined {
  const searchFrom = key.startsWith('@') ? key.indexOf('/') + 1 : 1
  const separator = searchFrom > 0 ? key.indexOf('@', searchFrom) : -1
  if (separator <= 0) {
    return undefined
  }
  return { name: key.slice(0, separator), ref: key.slice(separator + 1) }
}

/**
 * Resolves a pnpm dependency value to the `name@version` graph key of a
 * registry entry, or undefined when the value points outside the registry
 * (links, git/file/URL refs). Handles every recorded form: a plain version
 * (`1.2.3`), a peer-suffixed version (`1.2.3(react@18.2.0)`), and an
 * aliased target (`real-name@1.2.3`, spelled `/real-name@1.2.3` in v6).
 */
function pnpmDependencyGraphKey (depName: string, rawValue: unknown): string | undefined {
  if (typeof rawValue !== 'string') {
    return undefined
  }
  let value = stripPeerSuffix(rawValue)
  if (value.startsWith('/')) {
    value = value.slice(1)
  }
  if (semver.valid(value) !== null) {
    return `${depName}@${value}`
  }
  const aliased = splitNameAndRef(value)
  if (aliased !== undefined && semver.valid(aliased.ref) !== null) {
    return `${aliased.name}@${aliased.ref}`
  }
  return undefined
}

/** The dependency groups a pnpm snapshot or importer records. */
const PNPM_DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies']

function pnpmDependencyGraphKeys (owner: any): Set<string> {
  const keys = new Set<string>()
  for (const group of PNPM_DEPENDENCY_GROUPS) {
    for (const [depName, dep] of Object.entries<any>(owner?.[group] ?? {})) {
      // Importer dependencies are `{specifier, version}` objects; snapshot
      // and v6 package dependencies are plain strings.
      const value = typeof dep === 'string' ? dep : dep?.version
      const key = pnpmDependencyGraphKey(depName, value)
      if (key !== undefined) {
        keys.add(key)
      }
    }
  }
  return keys
}

/** Unions dependency edges into the graph under one source key. */
function addGraphEdges (graph: LockfileDependencyGraph, sourceKey: string, targets: Iterable<string>): void {
  let set = graph.edges.get(sourceKey)
  for (const target of targets) {
    if (set === undefined) {
      graph.edges.set(sourceKey, set = new Set())
    }
    set.add(target)
  }
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

  const result: LockfilePackages = { registry: [], excluded: [], graph: { edges: new Map(), roots: new Set() } }

  // Workspace-linked packages never appear in the `packages` section — only
  // as `link:` dependencies under `importers`. Record them so a user listing
  // their own workspace package gets a precise "cannot be embedded" error
  // instead of a "not found, check the spelling" one. The same walk
  // collects the graph roots: the direct dependencies of every importer.
  // v6 lockfiles of non-workspace projects record the project's own
  // dependencies at the document root instead of under `importers`.
  const importers = data?.importers
  const importerSources = typeof importers === 'object' && importers !== null
    ? Object.values<any>(importers)
    : [data]
  const linkedNames = new Set<string>()
  for (const importer of importerSources) {
    for (const group of PNPM_DEPENDENCY_GROUPS) {
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
    for (const key of pnpmDependencyGraphKeys(importer)) {
      result.graph.roots.add(key)
    }
  }

  // Dependency edges: v9 records them per snapshot, v6 inline on the
  // package entries. Iterating both covers both formats — v9 package
  // entries carry no dependency fields, and v6 has no snapshots section.
  // Peer-dependency variants produce several snapshots of one
  // name@version; their edges union.
  for (const section of [data?.snapshots, data?.packages]) {
    if (typeof section !== 'object' || section === null) {
      continue
    }
    for (const [rawKey, rawEntry] of Object.entries<any>(section)) {
      const key = stripPeerSuffix(rawKey.startsWith('/') ? rawKey.slice(1) : rawKey)
      const source = splitNameAndRef(key)
      if (source === undefined || semver.valid(source.ref) === null) {
        continue
      }
      addGraphEdges(result.graph, `${source.name}@${source.ref}`, pnpmDependencyGraphKeys(rawEntry))
    }
  }

  const packages = data?.packages
  if (typeof packages !== 'object' || packages === null) {
    return result
  }

  const seen = new Set<string>()
  for (const [rawKey, rawEntry] of Object.entries<any>(packages)) {
    // v6 keys have a leading slash (`/name@1.2.3`), v9 keys do not. The
    // name/ref separator is the first `@` past the name, which keeps the
    // name intact when the ref itself contains `@`, as git refs do
    // (`foo@git+ssh://git@github.com/...`).
    const key = stripPeerSuffix(rawKey.startsWith('/') ? rawKey.slice(1) : rawKey)
    const split = splitNameAndRef(key)
    if (split === undefined) {
      continue
    }
    const { name, ref } = split

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

/**
 * The identity a package-lock entry installs as: the real package name
 * (aliased installs record it in the entry; otherwise it is the last
 * node_modules path segment) and the recorded version. Undefined for
 * anything that is not a registry artifact — links, and git/file/URL
 * resolutions, whose contents (and therefore dependencies) can differ
 * from the registry package of the same name@version.
 */
function npmEntryGraphKey (key: string, entry: any): string | undefined {
  const lastNodeModules = key.lastIndexOf('node_modules/')
  if (lastNodeModules === -1 || entry?.link === true) {
    return undefined
  }
  if (typeof entry?.resolved === 'string' && !/^https?:/.test(entry.resolved)) {
    return undefined
  }
  const name = typeof entry?.name === 'string'
    ? entry.name
    : key.slice(lastNodeModules + 'node_modules/'.length)
  const version = typeof entry?.version === 'string' && semver.valid(entry.version) !== null
    ? entry.version
    : undefined
  return version === undefined ? undefined : `${name}@${version}`
}

/**
 * Resolves a dependency name from a package-lock path the way Node does:
 * the nearest `node_modules/<name>` entry walking up from the dependent's
 * own path to the workspace root.
 */
function resolveNpmDependencyPath (
  packages: Record<string, any>,
  fromPath: string,
  depName: string,
): string | undefined {
  let base = fromPath
  for (;;) {
    const candidate = base === '' ? `node_modules/${depName}` : `${base}/node_modules/${depName}`
    if (candidate in packages) {
      return candidate
    }
    if (base === '') {
      return undefined
    }
    const cut = base.lastIndexOf('/node_modules/')
    base = cut === -1 ? '' : base.slice(0, cut)
  }
}

/**
 * The dependency groups a package-lock entry can record. Non-root entries
 * never carry devDependencies (they are not installed); root and workspace
 * member entries do. Peer dependencies are installed and therefore edges.
 */
const NPM_DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

function npmDependencyGraphKeys (packages: Record<string, any>, fromPath: string, entry: any): Set<string> {
  const keys = new Set<string>()
  for (const group of NPM_DEPENDENCY_GROUPS) {
    const deps = entry?.[group]
    if (typeof deps !== 'object' || deps === null) {
      continue
    }
    for (const depName of Object.keys(deps)) {
      const depPath = resolveNpmDependencyPath(packages, fromPath, depName)
      if (depPath === undefined) {
        // E.g. an uninstalled optional peer dependency.
        continue
      }
      const depKey = npmEntryGraphKey(depPath, packages[depPath])
      if (depKey !== undefined) {
        keys.add(depKey)
      }
    }
  }
  return keys
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
  const result: LockfilePackages = { registry: [], excluded: [], graph: { edges: new Map(), roots: new Set() } }
  if (typeof packages !== 'object' || packages === null) {
    return result
  }

  const seen = new Set<string>()
  for (const [key, entry] of Object.entries<any>(packages)) {
    const lastNodeModules = key.lastIndexOf('node_modules/')
    if (lastNodeModules === -1) {
      // The workspace root ('') and workspace member paths are not
      // installable registry artifacts, but their dependencies are the
      // project's direct dependencies — the graph roots.
      for (const depKey of npmDependencyGraphKeys(packages, key, entry)) {
        result.graph.roots.add(depKey)
      }
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

    // Graph edges are collected before the dedupe and integrity gates:
    // several tree positions can hold the same name@version (their edges
    // union), and an integrity-less copy still occupies a real position in
    // the dependency tree.
    addGraphEdges(result.graph, `${name}@${version}`, npmDependencyGraphKeys(packages, key, entry))

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
