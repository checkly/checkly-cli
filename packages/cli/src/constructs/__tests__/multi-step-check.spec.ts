import { Project, Session } from '../project'
import { MultiStepCheck } from '../multi-step-check'

const runtimesWithMultiStepSupport = {
  2023.09: { name: '2023.09', multiStepSupport: true, default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
}

describe('MultistepCheck', () => {
  it('should report multistep as check type', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimesWithMultiStepSupport
    const check = new MultiStepCheck('main-check', {
      name: 'Main Check',
      runtimeId: '2023.09',
      code: { content: '' },
    })
    expect(check.synthesize()).toMatchObject({ checkType: 'MULTI_STEP' })
  })

  it('should throw if runtime does not support multi step check type', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = {
      ...runtimesWithMultiStepSupport,
      2023.09: {
        ...runtimesWithMultiStepSupport['2023.09'],
        multiStepSupport: false,
      },
    }
    expect(() => new MultiStepCheck('main-check', {
      name: 'Main Check',
      runtimeId: '2023.09',
      code: { content: '' },
    })).toThrowError('This runtime does not support multi step checks.')
  })

  it('should throw if runtime is not set and default runtime does not support multi step check type', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = {
      ...runtimesWithMultiStepSupport,
      9999.99: {
        ...runtimesWithMultiStepSupport['2023.09'],
        multiStepSupport: false,
      },
    }
    Session.defaultRuntimeId = '9999.99'
    expect(() => new MultiStepCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
    })).toThrowError('This runtime does not support multi step checks.')
    delete Session.defaultRuntimeId
  })

  it('should succeed if runtime is not set but default runtime supports multi step check type', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimesWithMultiStepSupport
    Session.defaultRuntimeId = '2023.09'
    expect(() => new MultiStepCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
    })).not.toThrowError()
    delete Session.defaultRuntimeId
  })

  it('should not synthesize runtime if not specified even if default runtime is set', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimesWithMultiStepSupport
    Session.defaultRuntimeId = '2023.09'
    const multiCheck = new MultiStepCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
    })
    const payload = multiCheck.synthesize()
    expect(payload.runtimeId).toBeUndefined()
    delete Session.defaultRuntimeId
  })

  it('should synthesize runtime if specified', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.availableRuntimes = runtimesWithMultiStepSupport
    Session.defaultRuntimeId = '2023.09'
    const multiCheck = new MultiStepCheck('main-check', {
      name: 'Main Check',
      runtimeId: '2023.09',
      code: { content: '' },
    })
    const payload = multiCheck.synthesize()
    expect(payload.runtimeId).toEqual('2023.09')
    delete Session.defaultRuntimeId
  })
})
