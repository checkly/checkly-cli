import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { BrowserCheck, CheckGroup } from '../index'
import { Project, Session } from '../project'

const runtimes = {
  '2022.10': { name: '2022.10', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
}

describe('BrowserCheck', () => {
  it('should correctly load file dependencies', async () => {
    Session.basePath = __dirname
    Session.availableRuntimes = runtimes
    const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'browser-check', filename)
    const bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), '2022.10')
    delete Session.basePath

    expect(bundle).toMatchObject({
      script: fs.readFileSync(getFilePath('entrypoint.js')).toString(),
      scriptPath: 'fixtures/browser-check/entrypoint.js',
      dependencies: [
        {
          path: 'fixtures/browser-check/dep1.js',
          content: fs.readFileSync(getFilePath('dep1.js')).toString(),
        },
        {
          path: 'fixtures/browser-check/dep2.js',
          content: fs.readFileSync(getFilePath('dep2.js')).toString(),
        },
      ],
    })
  })

  it('should fail to bundle if runtime is not specified and default runtime is not set', async () => {
    const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
    const bundle = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), undefined)
    }

    Session.basePath = __dirname
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = undefined
    await expect(bundle()).rejects.toThrow('runtime is not set')
    delete Session.basePath
    delete Session.defaultRuntimeId
  })

  it('should successfully bundle if runtime is not specified but default runtime is set', async () => {
    const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
    const bundle = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), undefined)
    }

    Session.basePath = __dirname
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.10'
    await expect(bundle()).resolves.not.toThrow()
    delete Session.basePath
    delete Session.defaultRuntimeId
  })

  it('should fail to bundle if runtime is not supported even if default runtime is set', async () => {
    const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
    const bundle = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), '9999.99')
    }

    Session.basePath = __dirname
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    await expect(bundle()).rejects.toThrow('9999.99 is not supported')
    delete Session.basePath
    delete Session.defaultRuntimeId
  })

  it('should not synthesize runtime if not specified even if default runtime is set', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      code: { content: 'console.log("test check")' },
    })
    const bundle = await browserCheck.bundle()
    const payload = bundle.synthesize()
    expect(payload.runtimeId).toBeUndefined()
    delete Session.defaultRuntimeId
  })

  it('should synthesize runtime if specified', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      runtimeId: '2022.02',
      code: { content: 'console.log("test check")' },
    })
    const bundle = await browserCheck.bundle()
    const payload = bundle.synthesize()
    expect(payload.runtimeId).toEqual('2022.02')
    delete Session.defaultRuntimeId
  })

  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    expect(browserCheck).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    expect(browserCheck).toMatchObject({ tags: ['test check'] })
  })

  it('should apply browser check defaults instead of generic check defaults', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['check default'] }
    Session.browserCheckDefaults = { tags: ['browser check default'] }
    const browserCheck = new BrowserCheck('test-check', {
      name: 'Test Check',
      code: { content: 'console.log("test check")' },
    })
    delete Session.checkDefaults
    delete Session.browserCheckDefaults
    expect(browserCheck).toMatchObject({ tags: ['browser check default'] })
  })

  it('should support setting groups with `groupId`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new BrowserCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
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
    const check = new BrowserCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
      group,
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })
})
