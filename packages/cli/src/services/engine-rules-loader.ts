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

// The Bun versions a Playwright Check Suite can run on, and the rules that map
// a requested Bun version onto one of them.
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
          // A not-yet-available minor maps to the highest pinned minor rather
          // than the floating '1', so the version does not drift with later
          // runner images while the project still pins it.
          { source: '>=1.5 <2', target: '1.4', action: 'allow', follow: false, notice: 'Bun ${SOURCE} is not available yet. Using Bun 1.4 instead.' },
          { source: '>=2', action: 'deny', follow: false, notice: 'Bun ${SOURCE} is not available yet.' },
        ],
      },
    },
  ],
}
