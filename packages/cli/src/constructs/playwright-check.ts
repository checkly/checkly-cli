import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

import type { AxiosResponse } from 'axios'
import Debug from 'debug'

import { checklyStorage } from '../rest/api'
import {
  bundlePlayWrightProject, cleanup,
} from '../services/util'
import { shellQuote } from '../services/shell'
import { RuntimeCheck, RuntimeCheckProps } from './check'
import {
  ConflictingPropertyDiagnostic,
  DeprecatedPropertyDiagnostic,
  InvalidPropertyValueDiagnostic,
  UnsatisfiedLocalPrerequisitesDiagnostic,
  UnsupportedPropertyDiagnostic,
} from './construct-diagnostics'
import { Diagnostics, WarningDiagnostic } from './diagnostics'
import { PlaywrightCheckBundle } from './playwright-check-bundle'
import { Session } from './project'
import { Ref } from './ref'
import { ConfigDefaultsGetter, makeConfigDefaultsGetter } from './check-config'
import { CheckConfigDefaults } from '../services/checkly-config-loader'

const debug = Debug('checkly:cli:constructs:playwright-check')

export interface PlaywrightCheckProps extends Omit<RuntimeCheckProps, 'retryStrategy' | 'doubleCheck'> {
  /**
   * Path to the Playwright configuration file (playwright.config.js/ts).
   * This file defines test settings, browser configurations, and project structure.
   *
   * @example "playwright.config.ts"
   */
  playwrightConfigPath: string

  /**
   * Command to install dependencies before running tests.
   * Useful for ensuring test dependencies are available in the runtime environment.
   *
   * @example "npm ci"
   * @example "yarn install --frozen-lockfile"
   */
  installCommand?: string

  /**
   * Command to execute Playwright tests.
   * The check will automatically append configuration, project, and tag arguments.
   *
   * @defaultValue "npx playwright test"
   * @example "npx playwright test --grep@checkly --config=playwright.foo.config.ts"
   * @example "yarn playwright test"
   */
  testCommand?: string

  /**
   * Specific Playwright projects to run from your configuration.
   * Projects let you run tests in different browsers or with different settings.
   *
   * @example "chromium"
   * @example ["chromium", "firefox"]
   * @see {@link https://playwright.dev/docs/test-projects | Playwright Projects}
   */
  pwProjects?: string | string[]

  /**
   * Tags to filter which tests to run using Playwright's grep functionality.
   * Tests matching any of these tags will be executed.
   *
   * @example "@smoke"
   * @example ["@smoke", "@critical"]
   * @see {@link https://playwright.dev/docs/test-annotations#tag-tests | Playwright Test Tags}
   */
  pwTags?: string | string[]

  /**
   * File patterns to include when bundling the test project.
   * Use this to include test files, utilities, and other assets.
   *
   * @example "tests/**\/*"
   * @example ["tests/**\/*", "utils/**\/*", "fixtures/**\/*"]
   */
  include?: string | string[]

  /**
   * Name of the check group to assign this check to.
   * The group must exist in your project configuration.
   *
   * @deprecated Use {@link group} instead. Depending on load order, group
   * defaults may not work correctly when using {@link groupName} to attach the
   * check to a group.
   * @example "E2E Tests"
   * @example "Critical User Flows"
   */
  groupName?: string
}

/**
 * Creates a Playwright Check to run end-to-end tests using Playwright Test.
 *
 * Playwright check suites allow you to monitor complex user interactions and workflows
 * by running your existing Playwright test suites as monitoring checks. They support
 * multiple browsers, test filtering, and custom test commands.
 *
 * @example
 * ```typescript
 * // Basic Playwright check
 * new PlaywrightCheck('e2e-login', {
 *   name: 'Login Flow E2E Test',
 *   playwrightConfigPath: '../playwright.config.js',
 *   frequency: Frequency.EVERY_10M,
 *   locations: ['us-east-1', 'eu-west-1']
 * })
 *
 * // Advanced check with projects and tags
 * new PlaywrightCheck('critical-flows', {
 *   name: 'Critical User Flows',
 *   playwrightConfigPath: '../playwright.config.js',
 *   installCommand: 'npm ci',
 *   pwProjects: ['chromium', 'firefox'],
 *   pwTags: ['@smoke', '@critical'],
 *   include: ['tests/**\/*', 'utils/**\/*'],
 *   groupName: 'E2E Tests',
 *   frequency: Frequency.EVERY_5M
 * })
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/constructs/playwright-check/ | PlaywrightCheck API Reference}
 * @see {@link https://www.checklyhq.com/docs/detect/synthetic-monitoring/playwright-checks/overview/ | Playwright Checks Documentation}
 * @see {@link https://playwright.dev/ | Playwright Documentation}
 */
export class PlaywrightCheck extends RuntimeCheck {
  installCommand?: string
  testCommand?: string
  playwrightConfigPath: string
  pwProjects: string[]
  pwTags: string[]
  include: string[]
  /** @deprecated Use {@link groupId} instead. Kept for compatibility with earlier versions. */
  groupName?: string

  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)

    const config = this.applyConfigDefaults(props)

    this.installCommand = config.installCommand
    this.pwProjects = config.pwProjects
      ? (Array.isArray(config.pwProjects) ? config.pwProjects : [config.pwProjects])
      : []
    this.pwTags = config.pwTags
      ? (Array.isArray(config.pwTags) ? config.pwTags : [config.pwTags])
      : []
    this.include = config.include
      ? (Array.isArray(config.include) ? config.include : [config.include])
      : []
    this.testCommand = config.testCommand
    this.groupName = config.groupName
    this.playwrightConfigPath = this.resolveContentFilePath(config.playwrightConfigPath)
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `PlaywrightCheck:${this.logicalId}`
  }

  protected configDefaultsGetter (props: PlaywrightCheckProps): ConfigDefaultsGetter<CheckConfigDefaults> {
    const group = PlaywrightCheck.#resolveGroupFromProps(props)

    return makeConfigDefaultsGetter(
      group?.getCheckDefaults(),
      {
        ...Session.checkDefaults,
        // Not supported by Playwright checks; exclude from defaults.
        retryStrategy: undefined,
        // Not supported by Playwright checks; exclude from defaults.
        doubleCheck: undefined,
      },
    )
  }

  static #resolveGroupFromProps (props: PlaywrightCheckProps) {
    // Check the preferred 'group' property first
    if (props.group) {
      return props.group
    }

    // Fall back to deprecated groupId
    if (props.groupId) {
      return PlaywrightCheck.#findGroupByRef(props.groupId)
    }

    // Fall back to deprecated groupName
    if (props.groupName) {
      return PlaywrightCheck.#findGroupByName(props.groupName)
    }

    return undefined
  }

  static #findGroupByRef (groupRef: Ref | string) {
    const ref = typeof groupRef === 'string' ? groupRef : groupRef.ref
    return Session.project?.data?.['check-group']?.[ref]
  }

  static #findGroupByName (groupName: string) {
    return Object.values(Session.project?.data?.['check-group'] ?? {})
      .find(group => group.name === groupName)
  }

  // eslint-disable-next-line require-await
  protected async validateDoubleCheck (diagnostics: Diagnostics): Promise<void> {
    if (this.doubleCheck !== undefined) {
      diagnostics.add(new UnsupportedPropertyDiagnostic(
        'doubleCheck',
        new Error(
          `This property is not available in Playwright checks.`
          + `\n\n`
          + `Playwright tests have their own built-in retry mechanism that `
          + `should be configured in your Playwright configuration file `
          + `instead.`,
        ),
      ))
    }
  }

  // eslint-disable-next-line require-await
  protected async validateRetryStrategy (diagnostics: Diagnostics): Promise<void> {
    // Check if retryStrategy was passed (even though TypeScript should prevent it)
    if (this.retryStrategy) {
      diagnostics.add(new UnsupportedPropertyDiagnostic(
        'retryStrategy',
        new Error(
          `This property is not available in Playwright checks.`
          + `\n\n`
          + `Playwright tests have their own built-in retry mechanism that `
          + `should be configured in your Playwright configuration file `
          + `instead.`,
        ),
      ))
    }
  }

  protected async validateHeadlessMode (diagnostics: Diagnostics): Promise<void> {
    try {
      const playwrightConfig = await Session.loadFile<any>(this.playwrightConfigPath)

      if (playwrightConfig?.use?.headless === false) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'headless',
          new Error(
            `headless: false is not supported.`
            + `\n\n`
            + `Checkly runs all Playwright checks in headless mode. `
            + `Please remove this setting from your Playwright configuration, `
            + `or set it to true.`,
          ),
        ))
      }

      if (Array.isArray(playwrightConfig?.projects)) {
        for (const project of playwrightConfig.projects) {
          if (project?.use?.headless === false) {
            const projectName = project.name ? ` in project "${project.name}"` : ''
            diagnostics.add(new InvalidPropertyValueDiagnostic(
              'headless',
              new Error(
                `headless: false is not supported${projectName}.`
                + `\n\n`
                + `Checkly runs all Playwright checks in headless mode. `
                + `Please remove this setting from your Playwright configuration, `
                + `or set it to true.`,
              ),
            ))
          }
        }
      }
    } catch (err: any) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'playwrightConfigPath',
        new Error(
          `Unable to parse Playwright config "${this.playwrightConfigPath}": ${err.message}`,
          { cause: err },
        ),
      ))
    }
  }

  protected async validateWebServerConfig (diagnostics: Diagnostics): Promise<void> {
    // Only show webServer warning for pw-test command when --include is not provided
    if (Session.currentCommand !== 'pw-test' || Session.includeFlagProvided) {
      return
    }

    try {
      const playwrightConfig = await Session.loadFile(this.playwrightConfigPath)

      if (playwrightConfig && typeof playwrightConfig === 'object' && 'webServer' in playwrightConfig) {
        diagnostics.add(new WarningDiagnostic({
          title: 'webServer configuration detected',
          message:
            `webServer configuration requires additional files. `
            + `Include all files needed to start the server (e.g., server scripts, config files) `
            + `by passing them via the --include flag.`,
        }))
      }
    } catch (err: any) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'playwrightConfigPath',
        new Error(
          `Unable to parse Playwright config "${this.playwrightConfigPath}": ${err.message}`,
          { cause: err },
        ),
      ))
    }
  }

  protected validateBrowserInstallCommand (diagnostics: Diagnostics): void {
    const playwrightInstallPattern = /playwright\s+install/i

    const commands = [
      { name: 'installCommand', value: this.installCommand },
      { name: 'testCommand', value: this.testCommand },
    ]

    for (const { name, value } of commands) {
      if (value && playwrightInstallPattern.test(value)) {
        diagnostics.add(new WarningDiagnostic({
          title: 'Unnecessary browser installation detected',
          message:
            `The ${name} contains "playwright install" which is not needed. `
            + `Checkly automatically installs browsers based on your pwProjects configuration. `
            + `Consider removing the browser installation from ${name}.`,
        }))
        break
      }
    }
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await this.#validateWorkspace(diagnostics)
    await this.validateRetryStrategy(diagnostics)

    try {
      await fs.access(this.playwrightConfigPath, fs.constants.R_OK)
      await this.validateWebServerConfig(diagnostics)
    } catch (err: any) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'playwrightConfigPath',
        new Error(`Playwright config "${this.playwrightConfigPath}" does not exist: ${err.message}`, { cause: err }),
      ))
    }

    await this.validateHeadlessMode(diagnostics)
    this.validateBrowserInstallCommand(diagnostics)

    this.#validateGroupReferences(diagnostics)
  }

  // eslint-disable-next-line require-await
  async #validateWorkspace (diagnostics: Diagnostics): Promise<void> {
    const workspace = Session.workspace
    if (workspace.isOk()) {
      const lockfile = workspace.ok().lockfile
      if (lockfile.isErr()) {
        diagnostics.add(new UnsatisfiedLocalPrerequisitesDiagnostic(new Error(
          `A lockfile is required for Playwright checks, but none could be `
          + `detected.`
          + '\n\n'
          + `Cause: ${lockfile.err().message}`,
        )))
      }
    } else if (workspace.isErr()) {
      diagnostics.add(new UnsatisfiedLocalPrerequisitesDiagnostic(new Error(
        `A workspace is required for Playwright checks, but none could be `
        + `detected.`
        + '\n\n'
        + `Cause: ${workspace.err().message}`,
      )))
    }
  }

  #validateGroupReferences (diagnostics: Diagnostics): void {
    if (this.groupName) {
      diagnostics.add(new DeprecatedPropertyDiagnostic(
        'groupName',
        new Error(
          `Use the "group" property instead. Depending on load order, `
          + 'group defaults may not work correctly when using "groupName".',
        ),
      ))

      if (this.groupId) {
        diagnostics.add(new ConflictingPropertyDiagnostic(
          'groupName',
          'group',
          new Error(`Prefer the "group" property over "groupName".`),
        ))
      }

      const checkGroup = PlaywrightCheck.#findGroupByName(this.groupName)
      if (!checkGroup) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'groupName',
          new Error(`No such group "${this.groupName}".`),
        ))
      }
    }
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  static buildTestCommand (
    testCommand: string, playwrightConfigPath: string, playwrightProject?: string[], playwrightTag?: string[],
  ) {
    const quotedPath = shellQuote(playwrightConfigPath)
    const projectArg = playwrightProject?.length ? ' --project ' + playwrightProject.map(p => shellQuote(p)).join(' ') : ''
    const tagArg = playwrightTag?.length ? ' --grep ' + shellQuote(playwrightTag.join('|')) : ''
    return `${testCommand} --config ${quotedPath}${projectArg}${tagArg}`
  }

  static async bundleProject (playwrightConfigPath: string, include: string[]) {
    let dir = ''
    try {
      const {
        outputFile,
        browsers,
        relativePlaywrightConfigPath,
        cacheHash,
        playwrightVersion,
        workingDir,
      } = await bundlePlayWrightProject(playwrightConfigPath, include)
      dir = outputFile
      const { data: { key } } = await PlaywrightCheck.uploadPlaywrightProject(dir)
      return {
        key,
        browsers,
        relativePlaywrightConfigPath,
        cacheHash,
        playwrightVersion,
        workingDir,
      }
    } finally {
      if (process.env['CHECKLY_PLAYWRIGHT_DEBUG_PERSIST_BUNDLE'] === '1') {
        debug(`Skip cleaning up bundle '${dir}'`)
      } else {
        debug(`Cleaning up bundle '${dir}'`)
        await cleanup(dir)
      }
    }
  }

  static async uploadPlaywrightProject (dir: string): Promise<AxiosResponse> {
    const { size } = await fs.stat(dir)
    const stream = createReadStream(dir)
    stream.on('error', err => {
      throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    return checklyStorage.uploadCodeBundle(stream, size)
  }

  async bundle (): Promise<PlaywrightCheckBundle> {
    // Prefer the standard groupId but fall back to the deprecated groupName
    // if available.
    const groupId = this.groupName && !this.groupId
      ? PlaywrightCheck.#findGroupByName(this.groupName)?.ref()
      : this.groupId

    const {
      key: codeBundlePath,
      browsers,
      cacheHash,
      playwrightVersion,
      relativePlaywrightConfigPath,
      workingDir,
    } = await PlaywrightCheck.bundleProject(this.playwrightConfigPath, this.include ?? [])

    const testCommand = PlaywrightCheck.buildTestCommand(
      this.testCommand ?? this.#defaultTestCommand(),
      relativePlaywrightConfigPath,
      this.pwProjects,
      this.pwTags,
    )

    return new PlaywrightCheckBundle(this, {
      groupId,
      codeBundlePath,
      browsers,
      cacheHash,
      playwrightVersion,
      testCommand,
      installCommand: this.installCommand,
      workingDir,
    })
  }

  #defaultTestCommand (): string {
    return Session.packageManager.execCommand(['playwright', 'test']).unsafeDisplayCommand
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
      doubleCheck: false,
    }
  }
}
