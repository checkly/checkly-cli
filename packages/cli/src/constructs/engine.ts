/**
 * Configuration for the JavaScript engine used to run Playwright tests.
 * Can be passed as a plain object in `checkly.config.ts`.
 */
export interface EngineConfig {
  readonly name: string
  readonly version: string
}

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
// Known versions are listed for IDE autocomplete; any string is accepted.
type NodeVersion = '22' | '24' | '26' | (string & {})
type BunVersion = '1.3' | (string & {})

export class Engine implements EngineConfig {
  readonly name: string
  readonly version: string

  private constructor (name: string, version: string) {
    this.name = name
    this.version = version
  }

  /**
   * Use Node.js as the test runner engine.
   * @param version - The Node.js major version (e.g., `'22'`, `'24'`).
   */
  static node (version: NodeVersion): Engine {
    return new Engine('node', version)
  }

  /**
   * Use Bun as the test runner engine.
   * @param version - The Bun version (e.g., `'1.3'`).
   */
  static bun (version: BunVersion): Engine {
    return new Engine('bun', version)
  }
}
