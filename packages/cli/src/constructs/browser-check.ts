import fs from 'node:fs/promises'
import path from 'node:path'

import { Check, CheckProps } from './check'
import { Session, SharedFileRef } from './project'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { pathToPosix } from '../services/util'
import { Content, Entrypoint, isContent, isEntrypoint } from './construct'
import { detectSnapshots } from '../services/snapshot-service'
import { PlaywrightConfig } from './playwright-config'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { BrowserCheckBundle } from './browser-check-bundle'

export interface BrowserCheckProps extends CheckProps {
  /**
   * A valid piece of Node.js javascript code describing a browser interaction
   * with the Puppeteer or Playwright frameworks.
   */
  code: Content|Entrypoint
  /**
   * A valid fully qualified domain name (FQDN) to check for SSL certificate
   * expiration. For example, 'app.checklyhq.com'.
   */
  sslCheckDomain?: string
  /**
   * A valid playwright config object, same format and keys as you would use on
   * playwright.config.ts
   */
  playwrightConfig?: PlaywrightConfig,
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
 * @see {@link https://www.checklyhq.com/docs/cli/constructs-reference/#browsercheck | BrowserCheck API Reference}
 * @see {@link https://www.checklyhq.com/docs/monitoring/browser-checks/ | Browser Checks Documentation}
 * @see {@link https://playwright.dev/ | Playwright Documentation}
 */
export class BrowserCheck extends Check {
  readonly code: Content | Entrypoint
  readonly sslCheckDomain?: string
  readonly playwrightConfig?: PlaywrightConfig

  /**
   * Constructs the Browser Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#browsercheck Read more in the docs}
   */
  constructor (logicalId: string, props: BrowserCheckProps) {
    if (props.group) {
      BrowserCheck.applyDefaultBrowserCheckGroupConfig(props, props.group.getBrowserCheckDefaults())
    }
    BrowserCheck.applyDefaultBrowserCheckConfig(props)

    super(logicalId, props)

    this.code = props.code
    this.sslCheckDomain = props.sslCheckDomain
    this.playwrightConfig = props.playwrightConfig

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
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

  private static applyDefaultBrowserCheckGroupConfig (props: CheckConfigDefaults, groupProps: CheckConfigDefaults) {
    let configKey: keyof CheckConfigDefaults
    for (configKey in groupProps) {
      const newVal: any = props[configKey] ?? groupProps[configKey]
      props[configKey] = newVal
    }
  }

  private static applyDefaultBrowserCheckConfig (props: CheckConfigDefaults) {
    if (!Session.browserCheckDefaults) {
      return
    }
    let configKey: keyof CheckConfigDefaults
    for (configKey in Session.browserCheckDefaults) {
      const newVal: any = props[configKey] ?? Session.browserCheckDefaults[configKey]
      props[configKey] = newVal
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
