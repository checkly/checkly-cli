export type ConfigDefaultsGetter<
  T extends object,
> = <K extends keyof T = keyof T>(key: K) => T[K] | undefined

export function makeConfigDefaultsGetter<T extends object> (
  ...defaults: (Partial<T> | undefined)[]
): ConfigDefaultsGetter<T> {
  const ok = defaults.filter(value => value !== undefined)

  function get<K extends keyof T> (key: K): T[K] | undefined {
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
