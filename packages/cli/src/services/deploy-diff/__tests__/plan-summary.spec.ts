import { describe, expect, it } from 'vitest'

import type { DiffEntry } from '../../../rest/projects.js'
import { planHasNoChanges, reducePlanForAgent } from '../plan-summary.js'

const options = { prettyTypes: { check: 'Check' }, foldedTypes: ['alert-channel-subscription'] }

/**
 * Whether a plan gives the deploy anything to write, which decides whether
 * anybody is asked to confirm it.
 */
describe('planHasNoChanges', () => {
  const unchanged: DiffEntry = { type: 'check', logicalId: 'api', physicalId: 1, action: 'UNCHANGED' }

  it('holds for a plan of unchanged resources and the relations folded into them', () => {
    expect(planHasNoChanges([
      unchanged,
      { type: 'alert-channel-subscription', logicalId: 'api#ops', physicalId: 2, action: 'UNCHANGED' },
    ], options)).toBe(true)
  })

  it('holds when the only thing reported is a relation the project does not manage and leaves alone', () => {
    expect(planHasNoChanges([{
      ...unchanged,
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }], options)).toBe(true)
  })

  it.each<[string, DiffEntry]>([
    ['a create', { type: 'check', logicalId: 'new', action: 'CREATE' }],
    ['an update', { type: 'check', logicalId: 'api', physicalId: 1, action: 'UPDATE' }],
    ['a delete', { type: 'check', logicalId: 'gone', physicalId: 3, action: 'DELETE' }],
    ['a detachment', { type: 'check', logicalId: 'kept', physicalId: 4, action: 'DETACH' }],
    ['a managed relation that changed, reported on its unchanged owner', {
      ...unchanged,
      changes: [{ path: '/alertChannels/ops', origin: 'code', after: { ref: 'ops' } }],
    }],
    ['a pruned relation', {
      type: 'alert-channel-subscription',
      logicalId: 'unmanaged:7',
      physicalId: 7,
      action: 'DELETE',
      origin: 'unmanaged',
      foldedInto: { type: 'check', logicalId: 'api' },
    }],
  ])('does not hold for %s', (_, entry) => {
    expect(planHasNoChanges([unchanged, entry], options)).toBe(false)
  })
})

/**
 * The plan as the agent envelope carries it: every entry and every changed
 * property, without the state the terminal rendering needs.
 */
describe('reducePlanForAgent', () => {
  it('drops the deployed state and the redaction table that applies to it', () => {
    const [reduced] = reducePlanForAgent([
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/name', origin: 'code', before: 'a', after: 'b' }],
        before: { id: 'x' },
        redactions: [{ path: '/request/basicAuth/password', kind: 'value' }],
      },
    ])
    expect(reduced).toEqual({
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [{ path: '/name', origin: 'code', before: 'a', after: 'b' }],
    })
  })
})
