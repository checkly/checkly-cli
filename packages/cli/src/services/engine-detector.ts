import fs from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'
import { Engine } from '../constructs/engine.js'
import { resolveEngineVersion } from './engine-resolver.js'

export interface EngineDetectionResult {
  engine: Engine
  notices: string[]
}

async function readFileIfExists (filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
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

function resolveEngineFromSemverRange (range: string): string | undefined {
  const min = semver.minVersion(range)
  return min ? String(min.major) : undefined
}

function resolveBunFromSemverRange (range: string): string | undefined {
  const min = semver.minVersion(range)
  return min ? `${min.major}.${min.minor}` : undefined
}

async function resolveNode (rawVersion: string): Promise<{ version: string, notices: string[] } | undefined> {
  const major = resolveNodeMajor(rawVersion)
  if (!major) return undefined
  const res = await resolveEngineVersion(major, 'node')
  if (res.denied) return undefined
  return { version: res.version, notices: res.notices }
}

async function resolveBun (rawVersion: string): Promise<{ version: string, notices: string[] } | undefined> {
  const ver = resolveBunVersion(rawVersion)
  if (!ver) return undefined
  const res = await resolveEngineVersion(ver, 'bun')
  if (res.denied) return undefined
  return { version: res.version, notices: res.notices }
}

export async function detectEngine (projectRoot: string): Promise<EngineDetectionResult | undefined> {
  let nodeResult: { version: string, notices: string[] } | undefined
  let bunResult: { version: string, notices: string[] } | undefined

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

  // 5. package.json engines
  if (!nodeResult || !bunResult) {
    const pkgJson = await readFileIfExists(path.join(projectRoot, 'package.json'))
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson)
        if (!nodeResult && pkg.engines?.node) {
          const extracted = resolveEngineFromSemverRange(pkg.engines.node)
          if (extracted) nodeResult = await resolveNode(extracted)
        }
        if (!bunResult && pkg.engines?.bun) {
          const extracted = resolveBunFromSemverRange(pkg.engines.bun)
          if (extracted) bunResult = await resolveBun(extracted)
        }
      } catch {
        // malformed package.json, skip
      }
    }
  }

  if (nodeResult) return { engine: Engine.node(nodeResult.version), notices: nodeResult.notices }
  if (bunResult) return { engine: Engine.bun(bunResult.version), notices: bunResult.notices }
  return undefined
}
