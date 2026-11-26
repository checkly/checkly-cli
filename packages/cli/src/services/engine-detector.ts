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
  /**
   * The version file or field a detected Node.js version was read from, such
   * as `package.json devEngines.runtime`. Unset for Bun.
   */
  nodeVersionSource?: string
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

/**
 * A Node.js version as the CLI sends it: trimmed and without a leading `v`.
 * Checkly resolves the result, or refuses it, so it is not validated here.
 */
export function normalizeNodeVersion (raw: string): string {
  return raw.trim().replace(/^v/, '')
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
  return s
}

function parseToolVersions (content: string): { nodeVersion?: string, bunVersion?: string } {
  let nodeVersion: string | undefined
  let bunVersion: string | undefined
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    if (parts[0] === 'nodejs' && !nodeVersion) nodeVersion = parts[1]
    if (parts[0] === 'bun' && !bunVersion) bunVersion = parts[1].replace(/^v/, '')
  }
  return { nodeVersion, bunVersion }
}

/**
 * The `version` of the first `node` entry of a `devEngines.runtime` or
 * `engines.runtime` field, which holds one entry or an array of them.
 */
function runtimeNodeVersion (runtime: any): unknown {
  const entries: any[] = Array.isArray(runtime) ? runtime : [runtime]
  return entries.find(entry => typeof entry === 'object' && entry !== null && entry.name === 'node')?.version
}

// semver.minVersion throws on values that are not a range at all (for
// example "latest"); such values are skipped so that detection falls through
// to the next source.
function minVersionOfRange (range: string): semver.SemVer | undefined {
  try {
    return semver.minVersion(range) ?? undefined
  } catch {
    return undefined
  }
}

function resolveBunFromSemverRange (range: string): string | undefined {
  const min = minVersionOfRange(range)
  return min ? `${min.major}.${min.minor}` : undefined
}

// Volta manifests can delegate to another JSON file through `volta.extends`,
// which is resolved relative to the manifest that declares it. The chain is
// depth-bounded, which also terminates cyclic `extends` references.
const MAX_VOLTA_EXTENDS_DEPTH = 10

interface VoltaPin {
  node: string
  /** The manifest that holds the `node` pin. */
  manifestPath: string
}

/**
 * Returns the raw `volta.node` value of an already-parsed Volta manifest,
 * following its `volta.extends` chain when the manifest itself carries no
 * `node` pin. Any JSON file can be extended, not only a package.json.
 */
async function resolveVoltaNode (manifest: any, manifestPath: string, depth = 0): Promise<VoltaPin | undefined> {
  const volta = manifest?.volta
  if (!volta || typeof volta !== 'object') return undefined
  if (typeof volta.node === 'string') return { node: volta.node, manifestPath }
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
async function detectVoltaNode (projectRoot: string, startPath: string): Promise<VoltaPin | undefined> {
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

interface DetectedNodeVersion {
  version: string
  source: string
}

/** A value that is not a string, or is empty once normalized, is skipped. */
function detectedNode (raw: unknown, source: string): DetectedNodeVersion | undefined {
  if (typeof raw !== 'string') return undefined
  const version = normalizeNodeVersion(raw)
  return version ? { version, source } : undefined
}

/**
 * The Node.js version the project asks for, from the first source that holds
 * one, as written. Every source but the Volta pin is read from `projectRoot`.
 */
async function detectNode (
  projectRoot: string,
  contextPath: string,
  pkg: any,
  toolVersions: string | undefined,
): Promise<DetectedNodeVersion | undefined> {
  // 1. package.json devEngines.runtime
  const devEnginesRuntime = detectedNode(runtimeNodeVersion(pkg?.devEngines?.runtime), 'package.json devEngines.runtime')
  if (devEnginesRuntime) return devEnginesRuntime

  // 2. package.json engines.runtime
  const enginesRuntime = detectedNode(runtimeNodeVersion(pkg?.engines?.runtime), 'package.json engines.runtime')
  if (enginesRuntime) return enginesRuntime

  // 3. .node-version
  const nodeVersionFile = detectedNode(await readFileIfExists(path.join(projectRoot, '.node-version')), '.node-version')
  if (nodeVersionFile) return nodeVersionFile

  // 4. .nvmrc; an alias such as `lts/*` falls through to the next source.
  const nvmrc = await readFileIfExists(path.join(projectRoot, '.nvmrc'))
  const nvmrcVersion = detectedNode(nvmrc === undefined ? undefined : parseNvmrc(nvmrc), '.nvmrc')
  if (nvmrcVersion) return nvmrcVersion

  // 5. .tool-versions
  const toolVersionsNode = detectedNode(
    toolVersions === undefined ? undefined : parseToolVersions(toolVersions).nodeVersion,
    '.tool-versions',
  )
  if (toolVersionsNode) return toolVersionsNode

  // 6. package.json volta.node, named by the manifest that holds the pin
  const voltaPin = await detectVoltaNode(projectRoot, contextPath)
  if (voltaPin) {
    const manifest = path.relative(path.resolve(projectRoot), voltaPin.manifestPath)
      .split(path.sep)
      .join(path.posix.sep)
    const volta = detectedNode(voltaPin.node, `${manifest} volta.node`)
    if (volta) return volta
  }

  // 7. package.json engines.node
  return detectedNode(pkg?.engines?.node, 'package.json engines.node')
}

interface ResolvedVersion {
  version: string
  notices: string[]
  denied: boolean
}

async function resolveBun (rawVersion: string): Promise<ResolvedVersion | undefined> {
  const ver = resolveBunVersion(rawVersion)
  if (!ver) return undefined
  const res = await resolveEngineVersion(ver, 'bun')
  return { version: res.version, notices: res.notices, denied: res.denied }
}

async function detectBun (
  projectRoot: string,
  pkg: any,
  toolVersions: string | undefined,
): Promise<ResolvedVersion | undefined> {
  let bunResult: ResolvedVersion | undefined

  // 1. .tool-versions
  if (toolVersions) {
    const tv = parseToolVersions(toolVersions)
    if (tv.bunVersion) bunResult = await resolveBun(tv.bunVersion)
  }

  // 2. .bun-version
  if (!bunResult) {
    const bunVersionFile = await readFileIfExists(path.join(projectRoot, '.bun-version'))
    if (bunVersionFile) {
      bunResult = await resolveBun(bunVersionFile)
    }
  }

  // 3. package.json engines.bun
  if (!bunResult && typeof pkg?.engines?.bun === 'string') {
    const extracted = resolveBunFromSemverRange(pkg.engines.bun)
    if (extracted) bunResult = await resolveBun(extracted)
  }

  return bunResult
}

/**
 * Detects the engine from the project's version files. A Node.js version from
 * any source wins over a Bun version.
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
  const pkg = await readJsonIfExists(path.join(projectRoot, 'package.json'))
  const toolVersions = await readFileIfExists(path.join(projectRoot, '.tool-versions'))

  const node = await detectNode(projectRoot, contextPath, pkg, toolVersions)
  if (node) {
    return { engine: Engine.node(node.version), notices: [], nodeVersionSource: node.source }
  }

  const bun = await detectBun(projectRoot, pkg, toolVersions)
  if (!bun) return undefined
  if (bun.denied) {
    return { engine: undefined, notices: bun.notices }
  }
  return { engine: Engine.bun(bun.version), notices: bun.notices }
}
