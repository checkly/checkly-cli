import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterAll } from 'vitest'

import { ApiCheck, CheckGroup, Request } from '../index'
import { Project, Session } from '../project'
import { usingIsolatedFixture } from '../../services/check-parser/__tests__/helper'

const runtimes = {
  '2022.10': { name: '2022.10', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', 'aws4': '1.11.0', 'axios': '0.27.2', 'btoa': '1.2.1', 'chai': '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', 'expect': '29.3.1', 'form-data': '4.0.0', 'jsonwebtoken': '8.5.1', 'lodash': '4.17.21', 'mocha': '10.1.0', 'moment': '2.29.2', 'node': '16.x', 'otpauth': '9.0.2', 'playwright': '1.28.0', 'typescript': '4.8.4', 'uuid': '9.0.0' } },
}

const request: Request = {
  method: 'GET',
  url: 'https://acme.com',
}

describe('ApiCheck', () => {
  beforeEach(() => {
    Session.resetSharedFiles()
  })

  afterAll(() => {
    Session.resetSharedFiles()
  })

  async function usingFixture (handle: ({ fixtureDir }: { fixtureDir: string }) => Promise<void>) {
    await usingIsolatedFixture(path.join(__dirname, 'fixtures', 'api-check'), async fixtureDir => {
      try {
        Session.basePath = fixtureDir
        Session.contextPath = fixtureDir

        await handle({
          fixtureDir,
        })
      } finally {
        Session.reset()
      }
    })
  }

  it('should correctly load file script dependencies', async () => {
    await usingFixture(async ({ fixtureDir }) => {
      Session.availableRuntimes = runtimes

      const getFilePath = (filename: string) => path.join(fixtureDir, filename)
      const bundle = await ApiCheck.bundle(getFilePath('entrypoint.js'), '2022.10')

      expect(bundle).toEqual({
        script: fs.readFileSync(getFilePath('entrypoint.js')).toString(),
        scriptPath: 'entrypoint.js',
        dependencies: [
          0,
          1,
        ],
      })

      expect(Session.sharedFiles).toEqual([
        {
          path: 'dep1.js',
          content: fs.readFileSync(getFilePath('dep1.js')).toString(),
        },
        {
          path: 'dep2.js',
          content: fs.readFileSync(getFilePath('dep2.js')).toString(),
        },
      ])
    })
  })

  it('should fail to bundle if runtime is not specified and default runtime is not set', async () => {
    await usingFixture(async ({ fixtureDir }) => {
      const getFilePath = (filename: string) => path.join(fixtureDir, filename)
      const bundle = async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _bundle = await ApiCheck.bundle(getFilePath('entrypoint.js'), undefined)
      }

      Session.availableRuntimes = runtimes
      Session.defaultRuntimeId = undefined
      await expect(bundle()).rejects.toThrow('runtime is not set')
    })
  })

  it('should successfully bundle if runtime is not specified but default runtime is set', async () => {
    await usingFixture(async ({ fixtureDir }) => {
      const getFilePath = (filename: string) => path.join(fixtureDir, filename)
      const bundle = async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _bundle = await ApiCheck.bundle(getFilePath('entrypoint.js'), undefined)
      }

      Session.basePath = __dirname
      Session.availableRuntimes = runtimes
      Session.defaultRuntimeId = '2022.10'
      await expect(bundle()).resolves.not.toThrow()
    })
  })

  it('should fail to bundle if runtime is not supported even if default runtime is set', async () => {
    await usingFixture(async ({ fixtureDir }) => {
      const getFilePath = (filename: string) => path.join(fixtureDir, filename)
      const bundle = async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _bundle = await ApiCheck.bundle(getFilePath('entrypoint.js'), '9999.99')
      }

      Session.basePath = __dirname
      Session.availableRuntimes = runtimes
      Session.defaultRuntimeId = '2022.02'
      await expect(bundle()).rejects.toThrow('9999.99 is not supported')
    })
  })

  it('should not synthesize runtime if not specified even if default runtime is set', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const apiCheck = new ApiCheck('test-check', {
      name: 'Test Check',
      request,
    })
    const bundle = await apiCheck.bundle()
    const payload = bundle.synthesize()
    expect(payload.runtimeId).toBeUndefined()
  })

  it('should synthesize runtime if specified', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const apiCheck = new ApiCheck('test-check', {
      name: 'Test Check',
      runtimeId: '2022.02',
      request,
    })
    const bundle = await apiCheck.bundle()
    const payload = bundle.synthesize()
    expect(payload.runtimeId).toEqual('2022.02')
    Session.defaultRuntimeId = undefined
  })

  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const apiCheck = new ApiCheck('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(apiCheck).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const apiCheck = new ApiCheck('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      request,
    })
    Session.checkDefaults = undefined
    expect(apiCheck).toMatchObject({ tags: ['test check'] })
  })

  it('should support setting groups with `groupId`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new ApiCheck('main-check', {
      name: 'Main Check',
      request,
      groupId: group.ref(),
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should support setting groups with `group`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new ApiCheck('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  describe('retryStrategy', () => {
    it('should synthesize `onlyOn`', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
      const apiCheck = new ApiCheck('test-check', {
        name: 'Test Check',
        runtimeId: '2022.02',
        request,
        retryStrategy: {
          type: 'LINEAR',
          onlyOn: 'NETWORK_ERROR',
        },
      })
      const bundle = await apiCheck.bundle()
      const payload = bundle.synthesize()
      expect(payload.retryStrategy?.onlyOn).toEqual('NETWORK_ERROR')
    })
  })
})
