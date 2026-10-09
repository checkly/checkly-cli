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
      [true, 'RetryStrategyBuilder.fixedStrategy({'],
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

  // The backend defaults the flag to `true` and only consults it when no
  // retry strategy is stored, so checks clear it whenever they set a strategy.
  describe.each(constructs.filter(([name]) => !name.startsWith('CheckGroup')))('%s payload', (_name, create) => {
    it('leaves doubleCheck and retryStrategy out without a retry strategy', () => {
      const payload = create({}).synthesize()
      expect(payload.retryStrategy).toBeUndefined()
      expect(payload.doubleCheck).toBeUndefined()
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

  it('keeps doubleCheck: false for monitors without a retry strategy', () => {
    const monitor = new UrlMonitor('url', { name: 'URL', request: { url: 'https://example.com' } })
    expect(monitor.synthesize().doubleCheck).toBe(false)
  })

  describe.each(constructs.filter(([name]) => name.startsWith('CheckGroup')))('%s payload', (name, create) => {
    it('leaves doubleCheck out without a retry strategy or with a typed one', () => {
      expect(create({}).synthesize().doubleCheck).toBeUndefined()
      expect(create({ retryStrategy: fixed }).synthesize().doubleCheck).toBeUndefined()
    })

    // The backend defaults the flag to `true` for v1 groups, which would retry
    // once despite `NO_RETRIES` being sent as a null strategy; v2 defaults to `false`.
    it('handles RetryStrategyBuilder.noRetries()', () => {
      const payload = create({ retryStrategy: RetryStrategyBuilder.noRetries() }).synthesize()
      expect(payload).toMatchObject({ retryStrategy: null })
      expect(payload.doubleCheck).toBe(name === 'CheckGroupV1' ? false : undefined)
    })
  })

  it('ignores doubleCheck in the session check defaults', async () => {
    Session.checkDefaults = { doubleCheck: true } as typeof Session.checkDefaults
    const check = constructs[0][1]({})
    expect(await doubleCheckDiagnostics(check)).toEqual([])
    expect(check.synthesize().doubleCheck).toBeUndefined()
  })
})
