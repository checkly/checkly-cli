export interface EngineRule {
  source: string
  target?: string
  action: string
  follow: boolean
  notice?: string
}

export interface EngineVersionConfig {
  default: string
  /**
   * Version strings accepted exactly as written, before any semver coercion.
   * Bun's `'1'` means "the newest 1.x available on the runner"; coerced, it
   * would read as 1.0.0 and be remapped like an old version.
   */
  aliases?: string[]
  rules: EngineRule[]
}

interface EngineEntry {
  name: string
  versions: EngineVersionConfig
}

export interface EnginesConfig {
  engines: EngineEntry[]
}

// Mirrors the engine versions the backend accepts (PLAYWRIGHT_*_ENGINE_VERSIONS
// in the monorepo's apps/backend/api/src/modules/common/schemas.js); the
// terraform provider embeds the same rules in its checkly/engines.json.
// Async to match a future API call signature.
// eslint-disable-next-line require-await
export async function loadEngineRules (): Promise<EnginesConfig> {
  return enginesConfig
}

export function getEngineConfig (config: EnginesConfig, engineName: string): EngineVersionConfig | undefined {
  return config.engines.find(e => e.name === engineName)?.versions
}

const enginesConfig: EnginesConfig = {
  engines: [
    {
      name: 'node',
      versions: {
        default: '22',
        rules: [
          { source: '^18', target: '22', action: 'allow', follow: true, notice: 'Node.js 18 (LTS) is EOL since 30 Apr 2025 and no longer available. Using Node.js 22 (LTS) instead.' },
          { source: '^20', target: '22', action: 'allow', follow: true, notice: 'Node.js 20 (LTS) is EOL since 30 Apr 2026 and no longer available. Using Node.js 22 (LTS) instead.' },
          { source: '<20', target: '22', action: 'allow', follow: true, notice: 'Node.js ${SOURCE} is not available. Using Node.js 22 (LTS) instead.' },
          { source: '^21', target: '22', action: 'allow', follow: true, notice: 'Node.js 21 (non-LTS) is EOL since 01 Jun 2024 and no longer available. Using Node.js 22 (LTS) instead.' },
          { source: '^22', target: '22', action: 'allow', follow: false },
          { source: '^23', target: '24', action: 'allow', follow: true, notice: 'Node.js 23 (non-LTS) is EOL since 01 Jun 2025 and no longer available. Using Node.js 24 (LTS) instead.' },
          { source: '^24', target: '24', action: 'allow', follow: false },
          { source: '^25', target: '26', action: 'allow', follow: true, notice: 'Node.js 25 (non-LTS) is EOL since 01 Jun 2026 and no longer available. Using Node.js 26 (LTS) instead.' },
          { source: '^26', target: '26', action: 'allow', follow: false },
          { source: '>=27', target: '26', action: 'allow', follow: true, notice: 'Node.js ${SOURCE} is not available yet. Using Node.js 26 (LTS) instead.' },
        ],
      },
    },
    {
      name: 'bun',
      versions: {
        // '1' is the newest 1.x the runner image carries; it is also what the
        // runner uses when a check sets no engine version.
        default: '1',
        aliases: ['1'],
        rules: [
          { source: '<1.3', target: '1.3', action: 'allow', follow: true, notice: 'Bun ${SOURCE} is not available. Using Bun 1.3 instead.' },
          { source: '~1.3', target: '1.3', action: 'allow', follow: false },
          { source: '~1.4', target: '1.4', action: 'allow', follow: false },
          // Like Node's `>=27`: a not-yet-available minor maps to the highest
          // pinned minor rather than the floating '1', so the version does not
          // drift with later runner images while the project still pins it.
          { source: '>=1.5 <2', target: '1.4', action: 'allow', follow: false, notice: 'Bun ${SOURCE} is not available yet. Using Bun 1.4 instead.' },
          { source: '>=2', action: 'deny', follow: false, notice: 'Bun ${SOURCE} is not available yet.' },
        ],
      },
    },
  ],
}
