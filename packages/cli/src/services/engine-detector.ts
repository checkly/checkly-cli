import fs from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'
import { Engine } from '../constructs/engine.js'

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

export async function detectEngine (projectRoot: string): Promise<Engine | undefined> {
  let nodeVersion: string | undefined
  let bunVersion: string | undefined

  // 1. .node-version
  const nodeVersionFile = await readFileIfExists(path.join(projectRoot, '.node-version'))
  if (nodeVersionFile) {
    nodeVersion = resolveNodeMajor(nodeVersionFile)
  }

  // 2. .nvmrc (only if no .node-version)
  if (!nodeVersion) {
    const nvmrc = await readFileIfExists(path.join(projectRoot, '.nvmrc'))
    if (nvmrc) {
      const parsed = parseNvmrc(nvmrc)
      if (parsed) nodeVersion = resolveNodeMajor(parsed)
    }
  }

  // 3. .tool-versions
  const toolVersions = await readFileIfExists(path.join(projectRoot, '.tool-versions'))
  if (toolVersions) {
    const tv = parseToolVersions(toolVersions)
    if (tv.nodeVersion && !nodeVersion) nodeVersion = resolveNodeMajor(tv.nodeVersion)
    if (tv.bunVersion && !bunVersion) bunVersion = resolveBunVersion(tv.bunVersion)
  }

  // 4. .bun-version
  if (!bunVersion) {
    const bunVersionFile = await readFileIfExists(path.join(projectRoot, '.bun-version'))
    if (bunVersionFile) {
      bunVersion = resolveBunVersion(bunVersionFile)
    }
  }

  // 5. package.json engines
  if (!nodeVersion || !bunVersion) {
    const pkgJson = await readFileIfExists(path.join(projectRoot, 'package.json'))
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson)
        if (!nodeVersion && pkg.engines?.node) {
          nodeVersion = resolveEngineFromSemverRange(pkg.engines.node)
        }
        if (!bunVersion && pkg.engines?.bun) {
          bunVersion = resolveBunFromSemverRange(pkg.engines.bun)
        }
      } catch {
        // malformed package.json, skip
      }
    }
  }

  // Return first match (node preferred unless only bun was found)
  if (nodeVersion) return Engine.node(nodeVersion)
  if (bunVersion) return Engine.bun(bunVersion)
  return undefined
}
