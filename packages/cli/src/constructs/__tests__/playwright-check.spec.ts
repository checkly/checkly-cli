import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AxiosHeaders } from 'axios'

import { CheckGroupV2, Diagnostics, PlaywrightCheck, RetryStrategyBuilder } from '../index'
import { Project, Session } from '../project'
import { checklyStorage } from '../../rest/api'

describe('PlaywrightCheck', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(checklyStorage, 'uploadCodeBundle').mockResolvedValue({
      data: { key: 'mock-upload-key' },
      status: 201,
      statusText: 'Created',
      headers: new AxiosHeaders(),
      config: {
        headers: new AxiosHeaders(),
      },
    })
    Session.currentCommand = undefined
    Session.includeFlagProvided = undefined
  })

  afterEach(() => {
    Session.currentCommand = undefined
    Session.includeFlagProvided = undefined
  })

  it('should synthesize groupName', async () => {
    Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const group = new CheckGroupV2('group', {
      name: 'Test Group',
    })

    const check = new PlaywrightCheck('foo', {
      name: 'Test Check',
      groupName: 'Test Group',
      playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
    })

    const diags = new Diagnostics()
    await check.validate(diags)

    expect(diags.isFatal()).toEqual(false)

    const bundle = await check.bundle()
    const payload = bundle.synthesize()

    expect(payload.groupId).toEqual(group.ref())
  })

  it('should synthesize group', async () => {
    Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const group = new CheckGroupV2('group', {
      name: 'Test Group',
    })

    const check = new PlaywrightCheck('foo', {
      name: 'Test Check',
      group,
      playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
    })

    const diags = new Diagnostics()
    await check.validate(diags)

    expect(diags.isFatal()).toEqual(false)

    const bundle = await check.bundle()
    const payload = bundle.synthesize()

    expect(payload.groupId).toEqual(group.ref())
  })

  it('should synthesize groupId', async () => {
    Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const group = new CheckGroupV2('group', {
      name: 'Test Group',
    })

    const check = new PlaywrightCheck('foo', {
      name: 'Test Check',
      groupId: group.ref(),
      playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
    })

    const diags = new Diagnostics()
    await check.validate(diags)

    expect(diags.isFatal()).toEqual(false)

    const bundle = await check.bundle()
    const payload = bundle.synthesize()

    expect(payload.groupId).toEqual(group.ref())
  })

  describe('validation', () => {
    it('should warn that groupName is deprecated', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const group = new CheckGroupV2('group', {
        name: 'Test Group',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        groupName: 'Test Group',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "groupName" is deprecated and will eventually be removed.'),
        }),
      ]))
    })

    it('should error if groupName is not found', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const group = new CheckGroupV2('group', {
        name: 'Test Group',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        groupName: 'Missing Group',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value provided for property "groupName" is not valid.'),
        }),
      ]))
    })

    it('should error if both group and groupName are set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('group', {
        name: 'Test Group',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        group,
        groupName: 'Test Group',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "groupName" cannot be set when "group" is set.'),
        }),
      ]))
    })

    it('should error if both groupId and groupName are set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const group = new CheckGroupV2('group', {
        name: 'Test Group',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        groupId: group.ref(),
        groupName: 'Test Group',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "groupName" cannot be set when "group" is set.'),
        }),
      ]))
    })

    it('should error if retryStrategy is set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
        // @ts-expect-error - Testing runtime validation. TypeScript should prevent this at compile time.
        retryStrategy: RetryStrategyBuilder.fixedStrategy({ maxRetries: 3 }),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "retryStrategy" is not supported.'),
        }),
      ]))
    })

    it('should error if doubleCheck is set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
        // @ts-expect-error Testing a property that isn't part of the type.
        doubleCheck: true,
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "doubleCheck" is not supported.'),
        }),
      ]))
    })

    it('should error if headless: false is set globally', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.headless-false.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value provided for property "headless" is not valid.'),
        }),
      ]))
    })

    it('should error if headless: false is set in a project', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.headless-false-project.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value provided for property "headless" is not valid.'),
        }),
        expect.objectContaining({
          message: expect.stringContaining('in project "chromium"'),
        }),
      ]))
    })

    it('should not error if headless: true is set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.headless-true.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value provided for property "headless" is not valid.'),
        }),
      ]))
    })

    it('should not error if headless is not set', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value provided for property "headless" is not valid.'),
        }),
      ]))
    })

    it('should warn if webServer is configured in playwright config when running pw-test', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check-webserver')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      Session.currentCommand = 'pw-test'

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check-webserver/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('webServer configuration detected'),
          message: expect.stringContaining('webServer configuration requires additional files'),
        }),
      ]))
    })

    it('should not warn about webServer when not running pw-test command', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check-webserver')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      Session.currentCommand = 'test'

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check-webserver/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.observations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('webServer configuration detected'),
        }),
      ]))
    })

    it('should not warn about webServer when --include flag is provided', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check-webserver')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      Session.currentCommand = 'pw-test'
      Session.includeFlagProvided = true

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check-webserver/playwright.config.ts'),
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.observations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('webServer configuration detected'),
        }),
      ]))
    })

    it('should warn when installCommand contains playwright install', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
        installCommand: 'npm ci && npx playwright install chromium',
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Unnecessary browser installation detected',
          message: expect.stringContaining('installCommand contains "playwright install"'),
        }),
      ]))
    })

    it('should warn when testCommand contains playwright install', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
        testCommand: 'npx playwright install && npx playwright test',
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Unnecessary browser installation detected',
          message: expect.stringContaining('testCommand contains "playwright install"'),
        }),
      ]))
    })

    it('should not warn when commands do not contain playwright install', async () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
        installCommand: 'npm ci',
        testCommand: 'npx playwright test',
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.observations).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Unnecessary browser installation detected',
        }),
      ]))
    })
  })

  describe('defaults', () => {
    it('should ignore retryStrategy from session check defaults', () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      Session.checkDefaults = {
        retryStrategy: RetryStrategyBuilder.fixedStrategy({ maxRetries: 3 }),
      }

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      expect(check.retryStrategy).toBeUndefined()
    })

    it('should ignore doubleCheck from session check defaults', () => {
      Session.basePath = path.resolve(__dirname, './fixtures/playwright-check')
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      Session.checkDefaults = {
        doubleCheck: true,
      }

      const check = new PlaywrightCheck('foo', {
        name: 'Test Check',
        playwrightConfigPath: path.resolve(__dirname, './fixtures/playwright-check/playwright.config.ts'),
      })

      expect(check.doubleCheck).toBeUndefined()
    })
  })
})
