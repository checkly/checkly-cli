import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { AxiosResponse } from 'axios'
import { checklyStorage } from '../rest/api'
import {
  bundlePlayWrightProject, cleanup,
} from '../services/util'
import { RuntimeCheck, RuntimeCheckProps } from './check'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { Diagnostics } from './diagnostics'
import { PlaywrightCheckBundle } from './playwright-check-bundle'
import { Session } from './project'
import { Ref } from './ref'

export interface PlaywrightCheckProps extends RuntimeCheckProps {
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
  pwProjects?: string|string[]

  /**
   * Tags to filter which tests to run using Playwright's grep functionality.
   * Tests matching any of these tags will be executed.
   *
   * @example "@smoke"
   * @example ["@smoke", "@critical"]
   * @see {@link https://playwright.dev/docs/test-annotations#tag-tests | Playwright Test Tags}
   */
  pwTags?: string|string[]

  /**
   * File patterns to include when bundling the test project.
   * Use this to include test files, utilities, and other assets.
   *
   * @example "tests/**\/*"
   * @example ["tests/**\/*", "utils/**\/*", "fixtures/**\/*"]
   */
  include?: string|string[]

  /**
   * Name of the check group to assign this check to.
   * The group must exist in your project configuration.
   *
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
 * @see {@link https://www.checklyhq.com/docs/cli/constructs-reference/#playwrightcheck | PlaywrightCheck API Reference}
 * @see {@link https://www.checklyhq.com/docs/playwright-checks/ | Playwright Checks Documentation}
 * @see {@link https://playwright.dev/ | Playwright Documentation}
 */
export class PlaywrightCheck extends RuntimeCheck {
  installCommand?: string
  testCommand: string
  playwrightConfigPath: string
  pwProjects: string[]
  pwTags: string[]
  include: string[]
  groupName?: string

  constructor (logicalId: string, props: PlaywrightCheckProps) {
    super(logicalId, props)
    this.installCommand = props.installCommand
    this.pwProjects = props.pwProjects
      ? (Array.isArray(props.pwProjects) ? props.pwProjects : [props.pwProjects])
      : []
    this.pwTags = props.pwTags
      ? (Array.isArray(props.pwTags) ? props.pwTags : [props.pwTags])
      : []
    this.include = props.include
      ? (Array.isArray(props.include) ? props.include : [props.include])
      : []
    this.testCommand = props.testCommand ?? 'npx playwright test'
    this.groupName = props.groupName
    this.playwrightConfigPath = this.resolveContentFilePath(props.playwrightConfigPath)
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `PlaywrightCheck:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    try {
      await fs.access(this.playwrightConfigPath, fs.constants.R_OK)
    } catch (err: any) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'playwrightConfigPath',
        new Error(`Playwright config "${this.playwrightConfigPath}" does not exist: ${err.message}`, { cause: err }),
      ))
    }

    if (this.groupName) {
      const checkGroup = this.#findGroupByName(this.groupName)
      if (!checkGroup) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'groupName',
          new Error(`No such group "${this.groupName}".`),
        ))
      }
    }
  }

  #findGroupByName (groupName: string) {
    return Object.values(Session.project?.data?.['check-group'] ?? {})
      .find(group => group.name === groupName)
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  static buildTestCommand (
    testCommand: string, playwrightConfigPath: string, playwrightProject?: string[], playwrightTag?: string[],
  ) {
    const quotedPath = `"${playwrightConfigPath}"`
    const projectArg = playwrightProject?.length ? ' --project ' + playwrightProject.map(p => `"${p}"`).join(' ') : ''
    const tagArg = playwrightTag?.length ? ' --grep "' + playwrightTag.join('|').replace(/"/g, '\\"') + '"' : ''
    return `${testCommand} --config ${quotedPath}${projectArg}${tagArg}`
  }

  static async bundleProject (playwrightConfigPath: string, include: string[]) {
    let dir = ''
    try {
      const {
        outputFile, browsers, relativePlaywrightConfigPath, cacheHash, playwrightVersion
      } = await bundlePlayWrightProject(playwrightConfigPath, include)
      dir = outputFile
      const { data: { key } } = await PlaywrightCheck.uploadPlaywrightProject(dir)
      return { key, browsers, relativePlaywrightConfigPath, cacheHash, playwrightVersion }
    } finally {
      await cleanup(dir)
    }
  }

  static async uploadPlaywrightProject (dir: string): Promise<AxiosResponse> {
    const { size } = await fs.stat(dir)
    const stream = createReadStream(dir)
    stream.on('error', (err) => {
         throw new Error(`Failed to read Playwright project file: ${err.message}`)
    })
    return checklyStorage.uploadCodeBundle(stream, size)
  }

  async bundle (): Promise<PlaywrightCheckBundle> {
    let groupId: Ref | undefined
    if (this.groupName) {
      const checkGroup = this.#findGroupByName(this.groupName)
      if (checkGroup) {
        groupId = checkGroup.ref()
      }
    }

    const {
      key: codeBundlePath,
      browsers,
      cacheHash,
      playwrightVersion,
      relativePlaywrightConfigPath
    } = await PlaywrightCheck.bundleProject(this.playwrightConfigPath, this.include ?? [])

    const testCommand = PlaywrightCheck.buildTestCommand(
      this.testCommand,
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
      installCommand: this.installCommand
    })
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'PLAYWRIGHT',
    }
  }
}
