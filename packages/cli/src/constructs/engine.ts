import { captureDeclaringFile } from './internal/declaring-file.js'
import { recordEngineDeclaringFile } from './internal/engine-declaring-file.js'

/**
 * Configuration for the JavaScript engine used to run Playwright tests.
 * Can be passed as a plain object in `checkly.config.ts`.
 */
export interface EngineConfig {
  readonly name: string
  readonly version: string
}

// Known versions are listed for IDE autocomplete; any string is accepted.
type BunVersion = '1' | '1.3' | '1.4' | (string & {})

/**
 * Selects the JavaScript engine and version for a Playwright Check Suite.
 *
 * @example
 * ```ts
 * import { PlaywrightCheck, Engine } from 'checkly/constructs'
 *
 * new PlaywrightCheck('login-test', {
 *   name: 'Login E2E',
 *   playwrightConfigPath: './playwright.config.ts',
 *   engine: Engine.node('24'),
 * })
 * ```
 */
export class Engine implements EngineConfig {
  readonly name: string
  readonly version: string

  private constructor (name: string, version: string) {
    this.name = name
    this.version = version
  }

  /**
   * Use Node.js as the test runner engine.
   *
   * Checkly resolves the version to one of the Node.js releases its runners
   * offer, and refuses a version that none of them satisfies.
   *
   * @param version - A Node.js version or a semver range, e.g. `'24'`,
   *   `'24.11.0'`, `'^24.11.0'` or `'>=22'`.
   */
  static node (version: string): Engine {
    const engine = new Engine('node', version)
    recordEngineDeclaringFile(engine, captureDeclaringFile(0))
    return engine
  }

  /**
   * Use Bun as the test runner engine.
   * @param version - The Bun minor version to pin (e.g., `'1.4'`), or `'1'`
   *   for the newest Bun 1.x available on the runner, which moves forward
   *   with each new Bun minor without a code change.
   */
  static bun (version: BunVersion): Engine {
    return new Engine('bun', version)
  }
}
