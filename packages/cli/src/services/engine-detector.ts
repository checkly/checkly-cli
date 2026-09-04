import fs from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'
import { Engine } from '../constructs/engine.js'
import { JsonSourceFile } from './check-parser/package-files/json-source-file.js'
import { lineage } from './check-parser/package-files/walk.js'
import { resolveEngineVersion } from './engine-resolver.js'

export interface EngineDetectionResult {
  engine: Engine | undefined
  notices: string[]
}

async function readFileIfExists (filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

// Untyped read: the `volta` field is not part of the package.json schema the
// bundler uses. Missing or malformed files resolve to undefined and are skipped.
async function readJsonIfExists (filePath: string): Promise<any | undefined> {
  const file = await JsonSourceFile.loadFromFilePath<any>(filePath)
  return file?.data
}

function resolveNodeMajor (raw: string): string | undefined {
  const stripped = raw.trim().replace(/^v/, '')
  const major = stripped.split('.')[0]
  if (!major || !/^\d+$/.test(major)) return undefined
  return major
}

function resolveBunVersion (raw: string): string | undefined {
  const stripped = raw.trim().replace(/^v/, '')
  const parts = stripped.split('.')
  if (parts.length < 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return undefined
  return `${parts[0]}.${parts[1]}`
}

function parseNvmrc (content: string): string | undefined {
  const s = content.trim()
  if (!s) return undefined
  if (s.startsWith('lts/') || s === 'lts' || s === 'node' || s === 'stable' || s === 'latest') return undefined
  return s.replace(/^v/, '')
}

function parseToolVersions (content: string): { nodeVersion?: string, bunVersion?: string } {
  let nodeVersion: string | undefined
  let bunVersion: string | undefined
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    if (parts[0] === 'nodejs' && !nodeVersion) nodeVersion = parts[1].replace(/^v/, '')
    if (parts[0] === 'bun' && !bunVersion) bunVersion = parts[1].replace(/^v/, '')
  }
  return { nodeVersion, bunVersion }
}

// semver.minVersion throws on values that are not a range at all (for
// example "lts"); such values are skipped so that detection falls through to
// the next source.
function minVersionOfRange (range: string): semver.SemVer | undefined {
  try {
    return semver.minVersion(range) ?? undefined
  } catch {
    return undefined
  }
}

function resolveEngineFromSemverRange (range: string): string | undefined {
  const min = minVersionOfRange(range)
  return min ? String(min.major) : undefined
}

function resolveBunFromSemverRange (range: string): string | undefined {
  const min = minVersionOfRange(range)
  return min ? `${min.major}.${min.minor}` : undefined
}

// Volta manifests can delegate to another JSON file through `volta.extends`,
// which is resolved relative to the manifest that declares it. The chain is
// depth-bounded, which also terminates cyclic `extends` references.
const MAX_VOLTA_EXTENDS_DEPTH = 10

/**
 * Returns the raw `volta.node` value of an already-parsed Volta manifest,
 * following its `volta.extends` chain when the manifest itself carries no
 * `node` pin. Any JSON file can be extended, not only a package.json.
 */
async function resolveVoltaNode (manifest: any, manifestPath: string, depth = 0): Promise<string | undefined> {
  const volta = manifest?.volta
  if (!volta || typeof volta !== 'object') return undefined
  if (typeof volta.node === 'string') return volta.node
  if (typeof volta.extends === 'string' && depth < MAX_VOLTA_EXTENDS_DEPTH) {
    const extendedPath = path.resolve(path.dirname(manifestPath), volta.extends)
    return resolveVoltaNode(await readJsonIfExists(extendedPath), extendedPath, depth + 1)
  }
  return undefined
}

/**
 * Mirrors how Volta itself locates a pin: walk up from the config's package
 * directory and use the nearest package.json that carries a `volta` key. That
 * manifest is authoritative (including its `extends` chain), so the walk stops
 * there even when it yields no Node version. The walk never leaves
 * `projectRoot`; a start path outside it falls back to `projectRoot` alone.
 */
async function detectVoltaNode (projectRoot: string, startPath: string): Promise<string | undefined> {
  const root = path.resolve(projectRoot)
  const start = path.resolve(startPath)
  const contained = start === root || start.startsWith(root + path.sep)
  for (const dir of lineage(contained ? start : root, { root })) {
    const manifestPath = path.join(dir, 'package.json')
    const manifest = await readJsonIfExists(manifestPath)
    if (manifest?.volta && typeof manifest.volta === 'object') {
      return resolveVoltaNode(manifest, manifestPath)
    }
  }
  return undefined
}

interface ResolvedVersion {
  version: string
  notices: string[]
  denied: boolean
}

async function resolveNode (rawVersion: string): Promise<ResolvedVersion | undefined> {
  const major = resolveNodeMajor(rawVersion)
  if (!major) return undefined
  const res = await resolveEngineVersion(major, 'node')
  return { version: res.version, notices: res.notices, denied: res.denied }
}

async function resolveBun (rawVersion: string): Promise<ResolvedVersion | undefined> {
  const ver = resolveBunVersion(rawVersion)
  if (!ver) return undefined
  const res = await resolveEngineVersion(ver, 'bun')
  return { version: res.version, notices: res.notices, denied: res.denied }
}

/**
 * Detects the engine from the project's version files.
 *
 * @param projectRoot Directory holding the version files (the workspace root
 *   when the project is part of one).
 * @param contextPath Directory of the package that contains the Checkly
 *   config. Only the Volta source uses it: mirroring Volta's own lookup, the
 *   pin is searched from here upwards to `projectRoot`. All other sources are
 *   read from `projectRoot` only.
 */
export async function detectEngine (
  projectRoot: string,
  contextPath: string = projectRoot,
): Promise<EngineDetectionResult | undefined> {
  let nodeResult: ResolvedVersion | undefined
  let bunResult: ResolvedVersion | undefined

  // 1. .node-version
  const nodeVersionFile = await readFileIfExists(path.join(projectRoot, '.node-version'))
  if (nodeVersionFile) {
    nodeResult = await resolveNode(nodeVersionFile)
  }

  // 2. .nvmrc (only if no .node-version)
  if (!nodeResult) {
    const nvmrc = await readFileIfExists(path.join(projectRoot, '.nvmrc'))
    if (nvmrc) {
      const parsed = parseNvmrc(nvmrc)
      if (parsed) nodeResult = await resolveNode(parsed)
    }
  }

  // 3. .tool-versions
  const toolVersions = await readFileIfExists(path.join(projectRoot, '.tool-versions'))
  if (toolVersions) {
    const tv = parseToolVersions(toolVersions)
    if (tv.nodeVersion && !nodeResult) nodeResult = await resolveNode(tv.nodeVersion)
    if (tv.bunVersion && !bunResult) bunResult = await resolveBun(tv.bunVersion)
  }

  // 4. .bun-version
  if (!bunResult) {
    const bunVersionFile = await readFileIfExists(path.join(projectRoot, '.bun-version'))
    if (bunVersionFile) {
      bunResult = await resolveBun(bunVersionFile)
    }
  }

  // 5. package.json volta.node (Volta pin; Volta does not manage Bun)
  if (!nodeResult) {
    const voltaNode = await detectVoltaNode(projectRoot, contextPath)
    if (voltaNode) {
      // Pins are normally exact versions, but Volta also accepts ranges.
      const extracted = resolveEngineFromSemverRange(voltaNode)
      if (extracted) nodeResult = await resolveNode(extracted)
    }
  }

  // 6. package.json engines
  if (!nodeResult || !bunResult) {
    const pkg = await readJsonIfExists(path.join(projectRoot, 'package.json'))
    if (!nodeResult && typeof pkg?.engines?.node === 'string') {
      const extracted = resolveEngineFromSemverRange(pkg.engines.node)
      if (extracted) nodeResult = await resolveNode(extracted)
    }
    if (!bunResult && typeof pkg?.engines?.bun === 'string') {
      const extracted = resolveBunFromSemverRange(pkg.engines.bun)
      if (extracted) bunResult = await resolveBun(extracted)
    }
  }

  const selected = nodeResult ?? bunResult
  if (!selected) return undefined
  if (selected.denied) {
    return { engine: undefined, notices: selected.notices }
  }
  const engine = selected === nodeResult
    ? Engine.node(selected.version)
    : Engine.bun(selected.version)
  return { engine, notices: selected.notices }
}
