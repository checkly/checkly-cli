import { ApiCheck, CheckGroup, Request } from '../index'
import { Project, Session } from '../project'
import * as path from 'path'
import * as fs from 'fs'

const runtimes = {
  '2022.10': { name: '2022.10', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
}

const request: Request = {
  method: 'GET',
  url: 'https://acme.com',
}

describe('ApiCheck', () => {
  it('should correctly load file script dependencies', () => {
    Session.basePath = __dirname
    Session.availableRuntimes = runtimes
    const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
    const bundle = ApiCheck.bundle(getFilePath('entrypoint.js'), '2022.10')
    delete Session.basePath

    expect(bundle).toEqual({
      script: fs.readFileSync(getFilePath('entrypoint.js')).toString(),
      scriptPath: 'fixtures/api-check/entrypoint.js',
      dependencies: [
        {
          path: 'fixtures/api-check/dep1.js',
          content: fs.readFileSync(getFilePath('dep1.js')).toString(),
        },
        {
          path: 'fixtures/api-check/dep2.js',
          content: fs.readFileSync(getFilePath('dep2.js')).toString(),
        },
      ],
    })
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
    delete Session.checkDefaults
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
    delete Session.checkDefaults
    expect(apiCheck).toMatchObject({ tags: ['test check'] })
  })

  it('should support setting groups with `groupId`', () => {
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
    expect(check.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should support setting groups with `group`', () => {
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
    expect(check.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })
})
