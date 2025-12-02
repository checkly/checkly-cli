import path from 'node:path'

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
