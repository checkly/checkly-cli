export interface EngineRule {
  source: string
  target?: string
  action: string
  follow: boolean
  notice?: string
}

export interface EngineVersionConfig {
  default: string
  rules: EngineRule[]
}

interface EngineEntry {
  name: string
  versions: EngineVersionConfig
}

export interface EnginesConfig {
  engines: EngineEntry[]
}

// Canonical source: monorepo/engines.json
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
        default: '1.3',
        rules: [
          { source: '<1.3', target: '1.3', action: 'allow', follow: true, notice: 'Bun ${SOURCE} is not available. Using Bun 1.3 instead.' },
          { source: '~1.3', target: '1.3', action: 'allow', follow: false },
          { source: '^1.4', target: '1.3', action: 'allow', follow: true, notice: 'Bun ${SOURCE} is not available yet. Using Bun 1.3 instead.' },
          { source: '>=2', action: 'deny', follow: false, notice: 'Bun ${SOURCE} is not available yet.' },
        ],
      },
    },
  ],
}
