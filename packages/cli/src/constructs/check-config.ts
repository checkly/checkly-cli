import { CheckConfigDefaults } from '../services/checkly-config-loader'

export type ConfigDefaultsGetter = <K extends keyof CheckConfigDefaults> (key: K) => CheckConfigDefaults[K]

export function makeConfigDefaultsGetter (
  ...defaults: (Partial<CheckConfigDefaults> | undefined)[]
): ConfigDefaultsGetter {
  const ok = defaults.filter(value => value !== undefined)

  function get<K extends keyof CheckConfigDefaults> (key: K): CheckConfigDefaults[K] {
    for (const config of ok) {
      // Older TS seems to need this check.
      if (config === undefined) {
        continue
      }

      const value = config[key]
      if (value !== undefined) {
        return value
      }
    }
  }

  return get
}
