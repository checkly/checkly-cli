import { describe, it, expect, afterEach } from 'vitest'

import { ApiCheck, TcpMonitor, TcpRequest, UrlMonitor } from '../index.js'
import { Diagnostics } from '../diagnostics.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const EXTENDED_RESPONSE_TIME_LIMITS = 'EXTENDED_RESPONSE_TIME_LIMITS'

const tcpRequest: TcpRequest = {
  hostname: 'acme.com',
  port: 443,
}

const newProject = () => {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
}

const validate = async (construct: { validate: (diagnostics: Diagnostics) => Promise<void> }) => {
  const diagnostics = new Diagnostics()
  await construct.validate(diagnostics)
  return diagnostics
}

describe('account-aware response time limits', () => {
  afterEach(() => {
    Session.accountFeatures = []
  })

  it('rejects an extended response time without the feature', async () => {
    newProject()
    Session.accountFeatures = []

    const diagnostics = await validate(new TcpMonitor('tcp-standard', {
      name: 'Test Check',
      request: tcpRequest,
      maxResponseTime: 45_000,
    }))

    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('must be 5000 or lower'),
      }),
    ]))
  })

  it('accepts an extended response time with the feature', async () => {
    newProject()
    Session.accountFeatures = [EXTENDED_RESPONSE_TIME_LIMITS]

    const diagnostics = await validate(new TcpMonitor('tcp-extended', {
      name: 'Test Check',
      request: tcpRequest,
      degradedResponseTime: 40_000,
      maxResponseTime: 45_000,
    }))

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('defers values above 45s to the API with the feature', async () => {
    newProject()
    Session.accountFeatures = [EXTENDED_RESPONSE_TIME_LIMITS]

    const diagnostics = await validate(new TcpMonitor('tcp-over-extended', {
      name: 'Test Check',
      request: tcpRequest,
      maxResponseTime: 300_000,
    }))

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('keeps the degraded <= max cross-check with the feature', async () => {
    newProject()
    Session.accountFeatures = [EXTENDED_RESPONSE_TIME_LIMITS]

    const diagnostics = await validate(new TcpMonitor('tcp-degraded-above-max', {
      name: 'Test Check',
      request: tcpRequest,
      degradedResponseTime: 46_000,
      maxResponseTime: 45_000,
    }))

    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('must be less than or equal to "maxResponseTime"'),
      }),
    ]))
  })

  it('raises the API check limit above its 30s standard', async () => {
    newProject()
    Session.accountFeatures = [EXTENDED_RESPONSE_TIME_LIMITS]

    const diagnostics = await validate(new ApiCheck('api-extended', {
      name: 'Test Check',
      request: { url: 'https://acme.com', method: 'GET' },
      maxResponseTime: 45_000,
    }))

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('raises the URL monitor limit above its 30s standard', async () => {
    newProject()
    Session.accountFeatures = [EXTENDED_RESPONSE_TIME_LIMITS]

    const diagnostics = await validate(new UrlMonitor('url-extended', {
      name: 'Test Check',
      request: { url: 'https://acme.com' },
      maxResponseTime: 45_000,
    }))

    expect(diagnostics.isFatal()).toBe(false)
  })
})
