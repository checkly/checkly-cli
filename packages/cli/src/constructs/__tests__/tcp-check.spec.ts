import { TcpCheck, CheckGroup, TcpRequest } from '../index'
import { Project, Session } from '../project'

const runtimes = {
  '2022.10': { name: '2022.10', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
}

const request: TcpRequest = {
  hostname: 'acme.com',
  port: 443,
}

describe('TcpCheck', () => {
  it('should not synthesize runtime if not specified even if default runtime is set', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const apiCheck = new TcpCheck('test-check', {
      name: 'Test Check',
      request,
    })
    const payload = apiCheck.synthesize()
    expect(payload.runtimeId).toBeUndefined()
    delete Session.defaultRuntimeId
  })

  it('should synthesize runtime if specified', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimes
    Session.defaultRuntimeId = '2022.02'
    const apiCheck = new TcpCheck('test-check', {
      name: 'Test Check',
      runtimeId: '2022.02',
      request,
    })
    const payload = apiCheck.synthesize()
    expect(payload.runtimeId).toEqual('2022.02')
    delete Session.defaultRuntimeId
  })

  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const apiCheck = new TcpCheck('test-check', {
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
    const apiCheck = new TcpCheck('test-check', {
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
    const check = new TcpCheck('main-check', {
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
    const check = new TcpCheck('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    expect(check.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })
})
