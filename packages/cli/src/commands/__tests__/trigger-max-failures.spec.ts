import { beforeEach, describe, expect, it, vi } from 'vitest'

const runnerState = vi.hoisted(() => ({
  constructorArgs: [] as unknown[][],
  maxFailuresReached: false,
}))

vi.mock('../../services/trigger-runner', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: class extends EventEmitter {
      testSessionId = 'ts-1'
      maxFailuresReached = false
      constructor (...args: unknown[]) {
        super()
        runnerState.constructorArgs.push(args)
      }

      run () {
        this.maxFailuresReached = runnerState.maxFailuresReached
        return Promise.resolve()
      }
    },
  }
})

vi.mock('../../services/test-session-cancel', () => ({
  registerTestSessionCancelHandler: vi.fn(),
  cancelTestSessionBestEffort: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/checkly-config-loader', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/checkly-config-loader.js')>(),
  loadChecklyConfig: vi.fn(),
}))

vi.mock('../../services/util', () => ({
  splitConfigFilePath: vi.fn().mockReturnValue({ configDirectory: '.', configFilenames: ['checkly.config.ts'] }),
  getEnvs: vi.fn().mockResolvedValue({}),
  getGitInformation: vi.fn().mockReturnValue(null),
  getCiInformation: vi.fn().mockReturnValue({ environment: null }),
}))

vi.mock('../../services/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/config.js')>()
  actual.default.getAccountId = () => 'acc-1'
  return actual
})

vi.mock('../../reporters/reporter', () => ({
  createReporters: vi.fn().mockReturnValue([]),
}))

import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { cancelTestSessionBestEffort } from '../../services/test-session-cancel.js'
import Trigger from '../trigger.js'

function createCommandContext (flags: Record<string, unknown> = {}) {
  return {
    parse: vi.fn().mockResolvedValue({
      flags: {
        'config': undefined,
        'env': [],
        'env-file': undefined,
        'reporter': ['ci'],
        'retries': undefined,
        'detach': false,
        'max-failures': undefined,
        ...flags,
      },
    }),
    style: { diagnostics: vi.fn() },
    prepareRunLocation: vi.fn().mockResolvedValue({ type: 'PUBLIC', region: 'eu-west-1' }),
    prepareVerboseFlag: () => false,
    prepareTestRetryStrategy: () => null,
    log: vi.fn(),
    constructor: Trigger,
  }
}

// TriggerRunner takes maxFailures as its last positional argument.
const passedMaxFailures = () => runnerState.constructorArgs.at(-1)!.at(-1)

describe('trigger --max-failures wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runnerState.constructorArgs = []
    runnerState.maxFailuresReached = false
    vi.mocked(loadChecklyConfig).mockResolvedValue({ config: { cli: { maxFailures: 3 } }, diagnostics: [] } as any)
  })

  it('passes the configured limit to the runner', async () => {
    await Trigger.prototype.run.call(createCommandContext() as any)
    expect(passedMaxFailures()).toBe(3)
  })

  it('passes the flag over the configured limit', async () => {
    await Trigger.prototype.run.call(createCommandContext({ 'max-failures': 1 }) as any)
    expect(passedMaxFailures()).toBe(1)
  })

  it('cancels the test session once the run stopped at the limit', async () => {
    runnerState.maxFailuresReached = true
    await Trigger.prototype.run.call(createCommandContext() as any)
    expect(cancelTestSessionBestEffort).toHaveBeenCalledWith('ts-1')
  })

  it('does not cancel the test session when the run finished', async () => {
    await Trigger.prototype.run.call(createCommandContext() as any)
    expect(cancelTestSessionBestEffort).not.toHaveBeenCalled()
  })
})
