import fs from 'node:fs/promises'
import path from 'node:path'

import { CheckProps, RuntimeCheck, RuntimeCheckProps } from './check'
import { Session, SharedFileRef } from './project'
import { pathToPosix } from '../services/util'
import { Content, Entrypoint, isContent, isEntrypoint } from './construct'
import { detectSnapshots } from '../services/snapshot-service'
import { PlaywrightConfig } from './playwright-config'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { BrowserCheckBundle } from './browser-check-bundle'
import { ConfigDefaultsGetter, makeConfigDefaultsGetter } from './check-config'

export interface BrowserCheckProps extends RuntimeCheckProps {
  /**
   * A valid piece of Node.js javascript code describing a browser interaction
   * with the Puppeteer or Playwright frameworks.
   */
  code: Content | Entrypoint
  /**
   * A valid fully qualified domain name (FQDN) to check for SSL certificate
   * expiration. For example, 'app.checklyhq.com'.
   */
  sslCheckDomain?: string
  /**
   * A valid playwright config object, same format and keys as you would use on
   * playwright.config.ts
   */
  playwrightConfig?: PlaywrightConfig
}

/**
 * Creates a Browser Check to monitor web applications using Playwright.
 *
 * Browser checks allow you to monitor complex user interactions, page performance,
 * and visual regressions. They run real browser scripts using Playwright to simulate
 * user behavior and validate web application functionality.
 *
 * @example
 * ```typescript
 * // Basic browser check with script file
 * new BrowserCheck('login-flow', {
 *   name: 'User Login Flow',
 *   frequency: Frequency.EVERY_10M,
 *   locations: ['us-east-1', 'eu-west-1'],
 *   code: {
 *     entrypoint: path.join(__dirname, 'login.spec.js')
 *   }
 * })
 *
 * // Browser check with inline code
 * new BrowserCheck('homepage', {
 *   name: 'Homepage Check',
 *   frequency: Frequency.EVERY_5M,
 *   code: {
 *     content: `
 *       const { test, expect } = require('@playwright/test')
 *
 *       test('homepage loads correctly', async ({ page }) => {
 *         await page.goto('https://example.com')
 *         await expect(page.locator('h1')).toContainText('Welcome')
 *         await expect(page).toHaveTitle(/Example/)
 *       })
 *     `
 *   },
 *   playwrightConfig: {
 *     use: {
 *       viewport: { width: 1280, height: 720 }
 *     }
 *   }
 * })
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/constructs/browser-check/ | BrowserCheck API Reference}
 * @see {@link https://www.checklyhq.com/docs/detect/synthetic-monitoring/browser-checks/overview/ | Browser Checks Documentation}
 * @see {@link https://playwright.dev/ | Playwright Documentation}
 */
export class BrowserCheck extends RuntimeCheck {
  readonly code: Content | Entrypoint
  readonly sslCheckDomain?: string
  readonly playwrightConfig?: PlaywrightConfig

  /**
   * Constructs the Browser Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://www.checklyhq.com/docs/constructs/browser-check/ Read more in the docs}
   */
  constructor (logicalId: string, props: BrowserCheckProps) {
    super(logicalId, props)

    const config = this.applyConfigDefaults(props)

    this.code = config.code
    this.sslCheckDomain = config.sslCheckDomain
    this.playwrightConfig = config.playwrightConfig

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `BrowserCheck:${this.logicalId}`
  }

  protected configDefaultsGetter (props: CheckProps): ConfigDefaultsGetter {
    return makeConfigDefaultsGetter(
      props.group?.getBrowserCheckDefaults(),
      Session.browserCheckDefaults,
      props.group?.getCheckDefaults(),
      Session.checkDefaults,
    )
  }

  protected applyConfigDefaults<T extends RuntimeCheckProps & Pick<BrowserCheckProps, 'playwrightConfig'>> (props: T): T {
    const config = super.applyConfigDefaults(props)
    const defaults = this.configDefaultsGetter(props)

    config.playwrightConfig ??= defaults('playwrightConfig')

    return config
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!isEntrypoint(this.code) && !isContent(this.code)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'code',
        new Error(`Either "entrypoint" or "content" is required.`),
      ))
    } else if (isEntrypoint(this.code) && isContent(this.code)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'code',
        new Error(`Provide exactly one of "entrypoint" or "content", but not both.`),
      ))
    } else if (isEntrypoint(this.code)) {
      const entrypoint = this.resolveContentFilePath(this.code.entrypoint)
      try {
        const stats = await fs.stat(entrypoint)
        if (stats.size === 0) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'code',
            new Error(`The entrypoint file "${entrypoint}" must not be empty.`),
          ))
        }
      } catch (err: any) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'code',
          new Error(`Unable to access entrypoint file "${entrypoint}": ${err.message}`, { cause: err }),
        ))
      }
    }
  }

  static async bundle (entry: string, runtimeId?: string) {
    const runtime = Session.getRuntime(runtimeId)
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = Session.getParser(runtime)
    const parsed = await parser.parse(entry)
    // Maybe we can get the parsed deps with the content immediately

    const deps: SharedFileRef[] = []
    for (const { filePath, content } of parsed.dependencies) {
      deps.push(Session.registerSharedFile({
        path: pathToPosix(path.relative(Session.basePath!, filePath)),
        content,
      }))
    }
    return {
      script: parsed.entrypoint.content,
      scriptPath: Session.relativePosixPath(parsed.entrypoint.filePath),
      dependencies: deps,
      snapshots: detectSnapshots(Session.basePath!, parsed.entrypoint.filePath),
    }
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  async bundle (): Promise<BrowserCheckBundle> {
    return new BrowserCheckBundle(this, await (async () => {
      if (isEntrypoint(this.code)) {
        const bundle = await BrowserCheck.bundle(
          this.resolveContentFilePath(this.code.entrypoint),
          this.runtimeId,
        )
        if (!bundle.script) {
          throw new Error(`The "code" property points to an empty file.`)
        }
        return {
          script: bundle.script,
          scriptPath: bundle.scriptPath,
          dependencies: bundle.dependencies,
          rawSnapshots: bundle.snapshots,
        }
      }

      const script = this.code.content
      return {
        script,
      }
    })())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      sslCheckDomain: this.sslCheckDomain || null, // empty string is converted to null
      playwrightConfig: this.playwrightConfig,
    }
  }
}
