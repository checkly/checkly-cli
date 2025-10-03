import path from 'node:path'

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosHeaders } from 'axios'

import { CheckGroupV2, Diagnostics, PlaywrightCheck } from '../index'
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
  })
})
