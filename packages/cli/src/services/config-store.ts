import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type ConfigStoreSchema<T> = { [K in keyof T]: { type: 'string' | 'object' } }

export interface ConfigStoreOptions<T> {
  projectName: string
  projectSuffix: string
  configName: string
  schema: ConfigStoreSchema<T>
}

/**
 * The directory `conf` (via `env-paths`) stores config files in, so that
 * existing logins keep working.
 */
function configDirectory (name: string): string {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Preferences', name)
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), name, 'Config')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), name)
}

function matchesType (value: unknown, type: 'string' | 'object'): boolean {
  if (type === 'object') {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
  return typeof value === type
}

/**
 * A small JSON file key-value store. It replaces `conf`, whose schema
 * validation alone (ajv) cost ~35ms on every command, and reads and writes the
 * same files in the same format.
 */
export class ConfigStore<T extends Record<string, unknown>> {
  readonly path: string
  readonly #schema: ConfigStoreSchema<T>

  constructor ({ projectName, projectSuffix, configName, schema }: ConfigStoreOptions<T>) {
    const name = projectSuffix ? `${projectName}-${projectSuffix}` : projectName
    this.path = path.join(configDirectory(name), `${configName}.json`)
    this.#schema = schema
  }

  get store (): Partial<T> {
    let contents: string
    try {
      contents = fs.readFileSync(this.path, 'utf8')
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return {}
      }
      throw err
    }
    const store = JSON.parse(contents)
    this.#validate(store)
    return store
  }

  set store (store: Partial<T>) {
    this.#validate(store)
    fs.mkdirSync(path.dirname(this.path), { recursive: true })
    const data = JSON.stringify(store, undefined, '\t')
    // Write to a temporary file and rename it over the config, so that a
    // crash mid-write can't leave a truncated file behind.
    const tempPath = `${this.path}.${process.pid}.tmp`
    try {
      fs.writeFileSync(tempPath, data, { mode: 0o666 })
      fs.renameSync(tempPath, this.path)
    } catch (err: any) {
      fs.rmSync(tempPath, { force: true })
      // Renaming over an existing file can fail on Windows; fall back to a
      // plain write like conf does.
      if (err?.code === 'EXDEV' || err?.code === 'EPERM') {
        fs.writeFileSync(this.path, data, { mode: 0o666 })
        return
      }
      throw err
    }
  }

  get<K extends keyof T> (key: K): T[K] | undefined {
    return this.store[key]
  }

  set<K extends keyof T> (key: K, value: T[K]): void {
    this.store = { ...this.store, [key]: value }
  }

  delete (key: keyof T): void {
    const store = this.store
    delete store[key]
    this.store = store
  }

  clear (): void {
    this.store = {}
  }

  #validate (store: unknown): asserts store is Partial<T> {
    if (typeof store !== 'object' || store === null || Array.isArray(store)) {
      throw new Error(`Config schema violation: \`${this.path}\` must be an object`)
    }
    const errors: string[] = []
    for (const [key, { type }] of Object.entries(this.#schema) as [string, { type: 'string' | 'object' }][]) {
      const value = (store as Record<string, unknown>)[key]
      if (value !== undefined && !matchesType(value, type)) {
        errors.push(`\`${key}\` must be ${type}`)
      }
    }
    if (errors.length) {
      throw new Error('Config schema violation: ' + errors.join('; '))
    }
  }
}
