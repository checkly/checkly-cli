import semver from 'semver'
import { loadEngineRules, getEngineConfig, type EngineVersionConfig } from './engine-rules-loader.js'

export interface EngineResolution {
  version: string
  notices: string[]
  denied: boolean
}

function resolveWithConfig (version: string, config: EngineVersionConfig): EngineResolution {
  const notices: string[] = []
  const seen = new Set<string>()
  let current = version

  while (true) {
    if (seen.has(current)) break
    seen.add(current)

    const sv = semver.coerce(current)
    if (!sv) {
      return { version: config.default, notices, denied: false }
    }

    let matched = false
    for (const rule of config.rules) {
      if (!semver.satisfies(sv, rule.source)) continue
      matched = true

      if (rule.notice) {
        notices.push(rule.notice.replaceAll('${SOURCE}', current))
      }

      if (rule.action === 'deny') {
        return { version: '', notices, denied: true }
      }

      const next = rule.target ?? current
      if (!rule.follow || next === current) {
        return { version: next, notices, denied: false }
      }

      current = next
      break
    }

    if (!matched) {
      return { version: config.default, notices, denied: false }
    }
  }

  return { version: current, notices, denied: false }
}

export async function resolveEngineVersion (version: string, engineName: string): Promise<EngineResolution> {
  const rules = await loadEngineRules()
  const config = getEngineConfig(rules, engineName)
  if (!config) {
    return { version, notices: [], denied: false }
  }
  return resolveWithConfig(version, config)
}
