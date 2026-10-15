import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../api-check.js'
import { BrowserCheck } from '../browser-check.js'
import { CheckGroupV1 } from '../check-group-v1.js'
import { CheckGroupV2 } from '../check-group-v2.js'
import { RemovedPropertyDiagnostic } from '../construct-diagnostics.js'
import { Construct } from '../construct.js'
import { Diagnostics } from '../diagnostics.js'
import { MultiStepCheck } from '../multi-step-check.js'
import { Project } from '../project.js'
import { RetryStrategyBuilder } from '../retry-strategy.js'
import { Session } from '../session.js'
import { UrlMonitor } from '../url-monitor.js'
import { loadSnapshot } from '../../runtimes/index.js'

// Each factory spreads `extra` into the props, so a test can set
// `doubleCheck`, which no props type includes, the way plain JavaScript would.
type Factory = (extra: object) => Construct & { synthesize (): Record<string, unknown> }

const constructs: [string, Factory][] = [
  ['ApiCheck', extra => new ApiCheck('api', {
    name: 'API', request: { url: 'https://example.com', method: 'GET' }, ...extra,
  })],
  ['BrowserCheck', extra => new BrowserCheck('browser', {
    name: 'Browser', code: { content: 'console.log("browser")' }, ...extra,
  })],
  ['MultiStepCheck', extra => new MultiStepCheck('multi-step', {
    name: 'MultiStep', code: { content: 'console.log("multi-step")' }, ...extra,
  })],
  ['CheckGroupV1', extra => new CheckGroupV1('group-v1', { name: 'Group V1', ...extra })],
  ['CheckGroupV2', extra => new CheckGroupV2('group-v2', { name: 'Group V2', ...extra })],
]

async function doubleCheckDiagnostics (construct: Construct): Promise<RemovedPropertyDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await construct.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is RemovedPropertyDiagnostic =>
    observation instanceof RemovedPropertyDiagnostic && observation.property === 'doubleCheck')
}

describe('doubleCheck', () => {
  beforeEach(async () => {
    Session.project = new Project('double-check', { name: 'Double check' })
    Session.availableRuntimes = Object.fromEntries((await loadSnapshot()).map(runtime => [runtime.name, runtime]))
    Session.defaultRuntimeId = '2025.04'
  })

  afterEach(() => {
    Session.reset()
  })

  describe.each(constructs)('%s', (_name, create) => {
    it.each([
      [true, 'RetryStrategyBuilder.singleRetry({'],
      [false, 'RetryStrategyBuilder.noRetries()'],
    ])('reports %j as removed with its retryStrategy equivalent', async (value, hint) => {
      const [diagnostic, ...rest] = await doubleCheckDiagnostics(create({ doubleCheck: value }))
      expect(rest).toEqual([])
      expect(diagnostic?.isFatal()).toBe(true)
      expect(diagnostic?.message).toContain('Property "doubleCheck" has been removed.')
      expect(diagnostic?.message).toContain(hint)
    })

    it('reports nothing when unset', async () => {
      expect(await doubleCheckDiagnostics(create({}))).toEqual([])
    })
  })

  const fixed = RetryStrategyBuilder.fixedStrategy({ maxRetries: 1 })
  const singleRetryElsewhere = { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false }

  // The backend still takes the legacy flag and defaults it to `true` for
  // checks and v1 groups; every payload turns it off, so the retry strategy
  // alone decides.
  describe.each(constructs.filter(([name]) => name !== 'CheckGroupV2'))('%s payload', (_name, create) => {
    it('sends the default single retry and doubleCheck: false without a retry strategy', () => {
      expect(create({}).synthesize()).toMatchObject({ retryStrategy: singleRetryElsewhere, doubleCheck: false })
    })

    it('sends a null strategy and doubleCheck: false for RetryStrategyBuilder.noRetries()', () => {
      const payload = create({ retryStrategy: RetryStrategyBuilder.noRetries() }).synthesize()
      expect(payload).toMatchObject({ retryStrategy: null, doubleCheck: false })
    })

    it('sends the strategy and doubleCheck: false for a typed strategy', () => {
      const payload = create({ retryStrategy: fixed }).synthesize()
      expect(payload).toMatchObject({ retryStrategy: fixed, doubleCheck: false })
    })
  })

  it('leaves the construct its own retry strategy, applying the default only to the payload', () => {
    expect((constructs[0][1]({}) as unknown as { retryStrategy?: unknown }).retryStrategy).toBeUndefined()
  })

  it('prefers the project default to the type default', () => {
    Session.checkDefaults = { retryStrategy: fixed }
    expect(constructs[0][1]({}).synthesize()).toMatchObject({ retryStrategy: fixed, doubleCheck: false })
  })

  it('sends no retries and doubleCheck: false for monitors without a retry strategy', () => {
    const monitor = new UrlMonitor('url', { name: 'URL', request: { url: 'https://example.com' } })
    expect(monitor.synthesize()).toMatchObject({ retryStrategy: null, doubleCheck: false })
  })

  describe('CheckGroupV2 payload', () => {
    const create = constructs.find(([name]) => name === 'CheckGroupV2')![1]

    // The backend defaults an omitted strategy to 'FALLBACK' for v2 groups,
    // which lets each check keep its own.
    it('leaves retryStrategy out and sends doubleCheck: false without a retry strategy', () => {
      const payload = create({}).synthesize()
      expect(payload.retryStrategy).toBeUndefined()
      expect(payload.doubleCheck).toBe(false)
    })

    it.each([
      ['RetryStrategyBuilder.noRetries()', RetryStrategyBuilder.noRetries(), null],
      ['a typed strategy', fixed, fixed],
    ])('sends %s with doubleCheck: false', (_label, retryStrategy, expected) => {
      const payload = create({ retryStrategy }).synthesize()
      expect(payload).toHaveProperty('retryStrategy', expected)
      expect(payload.doubleCheck).toBe(false)
    })
  })

  it('ignores doubleCheck in the session check defaults', async () => {
    Session.checkDefaults = { doubleCheck: true } as typeof Session.checkDefaults
    const check = constructs[0][1]({})
    expect(await doubleCheckDiagnostics(check)).toEqual([])
    expect(check.synthesize().doubleCheck).toBe(false)
  })
})
