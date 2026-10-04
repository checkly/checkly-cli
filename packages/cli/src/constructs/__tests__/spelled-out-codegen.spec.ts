import { beforeEach, describe, expect, it } from 'vitest'

import { ApiCheckCodegen, type ApiCheckResource } from '../api-check-codegen.js'
import { CheckGroupCodegen, type CheckGroupResource } from '../check-group-codegen.js'
import { EmailAlertChannelCodegen, type EmailAlertChannelResource } from '../email-alert-channel-codegen.js'
import { Context, renderConstruct } from '../internal/codegen/index.js'
import type { Codegen } from '../internal/codegen/codegen.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { DnsMonitorCodegen, type DnsMonitorResource } from '../dns-monitor-codegen.js'
import { SslMonitorCodegen, type SslMonitorResource } from '../ssl-monitor-codegen.js'
import {
  StatusPageV3ComponentCodegen,
  type StatusPageV3ComponentResource,
} from '../status-page-v3-component-codegen.js'
import {
  StatusPageV3AutomationRuleCodegen,
  type StatusPageV3AutomationRuleResource,
} from '../status-page-v3-automation-rule-codegen.js'
import { Program } from '../../sourcegen/index.js'

/**
 * A property the code being rendered spells out (`ContextOptions.spelledOut`)
 * is generated even when its value is the default the codegen otherwise
 * leaves out; without the set, the codegens generate what they always did.
 * One site per module here; the rule is the same at every site.
 */

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Project' })
})

function render<T> (
  makeCodegen: (program: Program) => Codegen<T>,
  logicalId: string,
  resource: T,
  spelledOut: string[],
) {
  const program = new Program({
    rootDirectory: '.',
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const context = new Context({ spelledOut: new Set(spelledOut) })
  return renderConstruct(makeCodegen(program), logicalId, resource, { context })
}

const apiCheck = (overrides: Partial<ApiCheckResource> = {}): ApiCheckResource => ({
  id: 'api-uuid',
  checkType: 'API',
  name: 'API',
  activated: true,
  muted: false,
  locations: [],
  tags: [],
  request: { url: 'https://example.com', method: 'GET', followRedirects: true, skipSSL: false },
  retryStrategy: { type: 'LINEAR', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true },
  ...overrides,
})

describe('a spelled-out property at its default', () => {
  it('is written for a check: props, request fields, retry options and key-value flags', () => {
    const resource = apiCheck({
      request: {
        url: 'https://example.com',
        method: 'GET',
        followRedirects: true,
        skipSSL: false,
        headers: [
          { key: 'x-a', value: '1', locked: false, secret: false },
          { key: 'x-b', value: '2', locked: false, secret: false },
        ],
      },
    })
    const plain = render(program => new ApiCheckCodegen(program), 'api', resource, [])
    expect(plain).not.toMatch(/activated|muted|locations|tags|followRedirects|skipSSL|locked|secret/)
    expect(plain).not.toMatch(/maxRetries|baseBackoffSeconds/)

    const spelled = render(program => new ApiCheckCodegen(program), 'api', resource, [
      'activated', 'muted', 'locations', 'tags',
      'request.skipSSL', 'retryStrategy.maxRetries',
      'request.headers[x-a].locked', 'request.headers[x-a].secret',
    ])
    expect(spelled).toContain('activated: true')
    expect(spelled).toContain('muted: false')
    expect(spelled).toContain('locations: []')
    expect(spelled).toContain('tags: []')
    expect(spelled).toContain('skipSSL: false')
    expect(spelled).not.toContain('followRedirects')
    expect(spelled).toContain('RetryStrategyBuilder.linearStrategy({')
    expect(spelled).toContain('maxRetries: 2')
    expect(spelled).not.toContain('baseBackoffSeconds')
    // Only the keyed element writes its flags.
    expect(spelled.match(/locked: false/g)).toHaveLength(1)
    expect(spelled.match(/secret: false/g)).toHaveLength(1)
    expect(spelled.indexOf('locked: false')).toBeLessThan(spelled.indexOf('key: \'x-b\''))
  })

  it('is written for the rest of a check\'s props and request fields', () => {
    const resource = apiCheck({
      shouldFail: false,
      testOnly: false,
      runParallel: false,
      request: {
        url: 'https://example.com',
        method: 'GET',
        followRedirects: true,
        body: '',
        bodyType: 'NONE',
        basicAuth: { username: '', password: '' },
        headers: [{ key: 'x-a', value: '1', secret: false }],
      },
    })
    const plain = render(program => new ApiCheckCodegen(program), 'api', resource, [])
    expect(plain).not.toMatch(/shouldFail|testOnly|runParallel|followRedirects|body|basicAuth|secret/)
    const spelled = render(program => new ApiCheckCodegen(program), 'api', resource, [
      'shouldFail', 'testOnly', 'runParallel',
      'request.followRedirects', 'request.body', 'request.bodyType', 'request.basicAuth',
      'request.headers[x-a].secret',
    ])
    expect(spelled).toContain('shouldFail: false')
    expect(spelled).toContain('testOnly: false')
    expect(spelled).toContain('runParallel: false')
    expect(spelled).toContain('followRedirects: true')
    expect(spelled).toContain('body: \'\'')
    expect(spelled).toContain('bodyType: \'NONE\'')
    expect(spelled).toContain('basicAuth: {\n      username: \'\',\n      password: \'\',\n    }')
    expect(spelled).toContain('secret: false')
    // A spelled-out `secret: false` is a plain value, never a secret variable.
    expect(spelled).not.toContain('secrets')
  })

  it('writes nothing for a flag the element has no value for, though another element of the key spells it', () => {
    const resource = apiCheck({
      request: {
        url: 'https://example.com',
        method: 'GET',
        headers: [
          { key: 'x-a', value: '1', locked: true },
          { key: 'x-a', value: '2' },
        ],
      },
    })
    const spelled = render(program => new ApiCheckCodegen(program), 'api', resource, [
      'request.headers[x-a].locked', 'request.headers[x-a].secret',
    ])
    expect(spelled.match(/locked: true/g)).toHaveLength(1)
    expect(spelled).not.toContain('locked: false')
    expect(spelled).not.toContain('secret')
  })

  it('is written for a group', () => {
    const resource: CheckGroupResource = {
      id: 42,
      name: 'Group',
      activated: true,
      muted: false,
      retryStrategy: { type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true },
    }
    const plain = render(program => new CheckGroupCodegen(program), 'grp', resource, [])
    expect(plain).not.toMatch(/activated|muted|sameRegion/)
    const spelled = render(program => new CheckGroupCodegen(program), 'grp', resource, [
      'activated', 'muted', 'retryStrategy.sameRegion',
    ])
    expect(spelled).toContain('activated: true')
    expect(spelled).toContain('muted: false')
    expect(spelled).toContain('sameRegion: true')
  })

  it('is written for an alert channel', () => {
    const resource: EmailAlertChannelResource = {
      id: 7,
      type: 'EMAIL',
      config: { address: 'ops@example.com' },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    }
    const plain = render(program => new EmailAlertChannelCodegen(program), 'email', resource, [])
    expect(plain).not.toMatch(/sendRecovery|sendFailure|sendDegraded|sslExpiry/)
    const spelled = render(program => new EmailAlertChannelCodegen(program), 'email', resource, [
      'sendFailure', 'sslExpiryThreshold',
    ])
    expect(spelled).toContain('sendFailure: true')
    expect(spelled).toContain('sslExpiryThreshold: 30')
    expect(spelled).not.toContain('sendRecovery')
  })

  it('is written for a group\'s API defaults', () => {
    const resource: CheckGroupResource = {
      id: 42,
      name: 'Group',
      apiCheckDefaults: { url: '', headers: [], queryParameters: [], basicAuth: { username: '', password: '' } },
    }
    const plain = render(program => new CheckGroupCodegen(program), 'grp', resource, [])
    expect(plain).not.toContain('basicAuth')
    const spelled = render(program => new CheckGroupCodegen(program), 'grp', resource, ['apiCheckDefaults.basicAuth'])
    expect(spelled).toContain('basicAuth: {\n      username: \'\',\n      password: \'\',\n    }')
  })

  it('is written for a DNS monitor\'s protocol', () => {
    const resource: DnsMonitorResource = {
      id: 'dns-uuid',
      checkType: 'DNS',
      name: 'DNS',
      request: { query: 'example.com', recordType: 'A', protocol: 'UDP' },
    }
    const plain = render(program => new DnsMonitorCodegen(program), 'dns', resource, [])
    expect(plain).not.toContain('protocol')
    const spelled = render(program => new DnsMonitorCodegen(program), 'dns', resource, ['request.protocol'])
    expect(spelled).toContain('protocol: \'UDP\'')
  })

  it('is written for a monitor\'s request', () => {
    const resource: SslMonitorResource = {
      id: 'ssl-uuid',
      checkType: 'SSL',
      name: 'SSL',
      request: { sslConfig: { hostname: 'example.com', port: 443, ipFamily: 'IPv4', skipChainValidation: false } },
    }
    const plain = render(program => new SslMonitorCodegen(program), 'ssl', resource, [])
    expect(plain).not.toMatch(/port|ipFamily|skipChainValidation/)
    const spelled = render(program => new SslMonitorCodegen(program), 'ssl', resource, [
      'request.port', 'request.ipFamily', 'request.sslConfig.skipChainValidation',
    ])
    expect(spelled).toContain('port: 443')
    expect(spelled).toContain('ipFamily: \'IPv4\'')
    expect(spelled).toContain('skipChainValidation: false')
  })

  it('is written for a status page component: its type, hidden flag and configuration', () => {
    const resource: StatusPageV3ComponentResource = {
      id: 'component-uuid',
      statusPageId: 'page-uuid',
      type: 'SERVICE',
      name: 'API',
      hidden: false,
      displayOrder: 1,
      configuration: { showHistoricalData: true },
    }
    const plain = render(program => new StatusPageV3ComponentCodegen(program), 'component', resource, [])
    expect(plain).not.toMatch(/type|hidden|showHistoricalData/)
    const spelled = render(program => new StatusPageV3ComponentCodegen(program), 'component', resource, [
      'type', 'hidden', 'showHistoricalData',
    ])
    expect(spelled).toContain('type: \'SERVICE\'')
    expect(spelled).toContain('hidden: false')
    expect(spelled).toContain('showHistoricalData: true')
  })

  it('is written for a status page automation rule, and a null value still is not', () => {
    const resource: StatusPageV3AutomationRuleResource = {
      id: 'rule-uuid',
      statusPageId: 'page-uuid',
      name: 'Rule',
      enabled: true,
      notifySubscribers: null,
      firstUpdate: 'Investigating',
      lastUpdate: 'Resolved',
      tags: [],
      components: [],
    }
    const plain = render(program => new StatusPageV3AutomationRuleCodegen(program), 'rule', resource, [])
    expect(plain).not.toMatch(/enabled|notifySubscribers/)
    const spelled = render(program => new StatusPageV3AutomationRuleCodegen(program), 'rule', resource, [
      'enabled', 'notifySubscribers',
    ])
    expect(spelled).toContain('enabled: true')
    expect(spelled).not.toContain('notifySubscribers')
  })
})
