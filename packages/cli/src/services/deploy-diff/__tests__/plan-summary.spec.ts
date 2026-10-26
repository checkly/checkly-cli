import { describe, expect, it } from 'vitest'

import type { DiffEntry } from '../../../rest/projects.js'
import {
  driftLines,
  findDrift,
  planChangeLines,
  planHasNoChanges,
  reducePlanForAgent,
  unbaselinedResources,
} from '../plan-summary.js'

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
    ['a resource updated to set the baseline, in which nothing differs', {
      type: 'check', logicalId: 'api', physicalId: 1, action: 'UPDATE', basis: 'live',
    }],
    ['such a resource whose only reported change is a relation the project does not manage', {
      type: 'check',
      logicalId: 'api',
      physicalId: 1,
      action: 'UPDATE',
      basis: 'live',
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }],
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
 * The lines the confirmation lists. A resource Checkly compared with what is
 * live is written whatever was found, to set the baseline for later plans, so
 * it is listed; as a baseline when nothing differs, as an update otherwise.
 */
describe('planChangeLines', () => {
  it('names a resource written to set the baseline as such, and one with a difference as an update', () => {
    const setsBaseline = (logicalId: string): DiffEntry =>
      ({ type: 'check', logicalId, physicalId: logicalId, action: 'UPDATE', basis: 'live' })
    expect(planChangeLines([
      setsBaseline('a'),
      {
        ...setsBaseline('relation-only'),
        changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
      },
      {
        ...setsBaseline('renamed'),
        changes: [{ path: '/name', origin: 'code', before: 'Old', after: 'New' }],
      },
      { type: 'check', logicalId: 'new', action: 'CREATE' },
    ], options)).toEqual([
      'Update Check: renamed',
      'Create Check: new',
      'Set a baseline for Check: a',
      'Set a baseline for Check: relation-only',
    ])
  })

  it('lists what the deploy changes before what it baselines, and sums up each kind it leaves out', () => {
    // A first plan of a large project: the two real edits must not be pushed
    // past the window by the resources that only set a baseline.
    const baselines = Array.from({ length: 25 }, (_, index): DiffEntry =>
      ({ type: 'check', logicalId: `b${index}`, physicalId: index, action: 'UPDATE', basis: 'live' }))
    const lines = planChangeLines([
      ...baselines.slice(0, 10),
      { type: 'check', logicalId: 'edited', physicalId: 'e', action: 'UPDATE', basis: 'live', changes: [{ path: '/name', origin: 'code', before: 'Old', after: 'New' }] },
      ...baselines.slice(10),
      { type: 'check', logicalId: 'new', action: 'CREATE' },
    ], options)
    expect(lines.slice(0, 3)).toEqual(['Update Check: edited', 'Create Check: new', 'Set a baseline for Check: b0'])
    expect(lines).toHaveLength(21)
    expect(lines[20]).toBe('Set a baseline for 7 more resource(s); run with --preview to see them all')

    const creates = Array.from({ length: 22 }, (_, index): DiffEntry => ({ type: 'check', logicalId: `c${index}`, action: 'CREATE' }))
    expect(planChangeLines([...baselines.slice(0, 3), ...creates], options)[20])
      .toBe('Create or update 2 more resource(s) and Set a baseline for 3 more resource(s); run with --preview to see them all')
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

/**
 * What `--fail-on-drift` refuses to overwrite: properties changed in Checkly
 * and resources deleted there since the last planned deploy.
 */
describe('findDrift', () => {
  it('finds nothing in a plan of code changes only', () => {
    expect(findDrift([{
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [{ path: '/name', origin: 'code', before: 'a', after: 'b' }],
    }], options)).toEqual([])
  })

  it('reports the properties changed in Checkly, also those the code changed too', () => {
    expect(findDrift([{
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [
        { path: '/name', origin: 'code', before: 'a', after: 'b' },
        { path: '/frequency', origin: 'remote', before: 10, after: 5 },
        { path: '/muted', origin: 'both', before: false, after: true, remote: { before: false, after: false } },
      ],
    }], options)).toEqual([{ type: 'check', logicalId: 'api', deleted: false, paths: ['/frequency', '/muted'] }])
  })

  it('leaves a path both sides moved to the same value, but not a secret or a cause', () => {
    expect(findDrift([{
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [
        { path: '/name', origin: 'both', before: 'a', after: 'b', remote: { before: 'a', after: 'b' } },
        { path: '/script', origin: 'both', cause: 'bundle' },
        {
          path: '/environmentVariables',
          origin: 'both',
          before: [{ $masked: 'same' }],
          after: [{ $masked: 'changed' }],
          remote: { before: [{ $masked: 'same' }], after: [{ $masked: 'changed' }] },
          secret: true,
        },
      ],
    }], options)).toEqual([{
      type: 'check',
      logicalId: 'api',
      deleted: false,
      paths: ['/script', '/environmentVariables'],
    }])
  })

  it('reports a resource deleted in Checkly, which the deploy creates again', () => {
    expect(findDrift([
      { type: 'check', logicalId: 'gone', action: 'CREATE', origin: 'remote' },
      { type: 'check', logicalId: 'new', action: 'CREATE', origin: 'code' },
    ], options)).toEqual([{ type: 'check', logicalId: 'gone', deleted: true, paths: [] }])
  })

  it('reports a relation\'s drift on the resource it is folded into, once', () => {
    const owner = { type: 'check', logicalId: 'api' }
    expect(findDrift([
      {
        ...owner,
        action: 'UPDATE',
        changes: [{ path: '/alertChannels/0', origin: 'remote', before: { ref: 'ops' } }],
      },
      { type: 'alert-channel-subscription', logicalId: 'api#ops', action: 'CREATE', origin: 'remote', foldedInto: owner },
    ], options)).toEqual([{
      ...owner,
      deleted: false,
      paths: ['/alertChannels/0', 'alert-channel-subscription'],
    }])
  })

  it('leaves relations the project does not manage alone, pruned or not', () => {
    const owner = { type: 'check', logicalId: 'api' }
    expect(findDrift([
      {
        ...owner,
        action: 'UNCHANGED',
        changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
      },
      { type: 'alert-channel-subscription', logicalId: 'api#ops', action: 'DELETE', origin: 'unmanaged', foldedInto: owner },
    ], options)).toEqual([])
  })
})

describe('unbaselinedResources', () => {
  it('counts the declared resources compared with what is live, not the relations folded into them', () => {
    const owner = { type: 'check', logicalId: 'api' }
    expect(unbaselinedResources([
      { ...owner, action: 'UPDATE', basis: 'live' },
      { type: 'check', logicalId: 'other', action: 'UPDATE' },
      { type: 'alert-channel-subscription', logicalId: 'api#ops', action: 'UPDATE', basis: 'live', foldedInto: owner },
    ], options)).toBe(1)
  })
})

describe('driftLines', () => {
  it('says what changed in Checkly and what the deploy would do about it', () => {
    expect(driftLines([
      { type: 'check', logicalId: 'api', deleted: false, paths: ['/frequency', '/muted'] },
      { type: 'check', logicalId: 'gone', deleted: true, paths: [] },
    ], options)).toEqual([
      'Check: api was changed in Checkly (/frequency, /muted); this deploy would overwrite it',
      'Check: gone was deleted in Checkly; this deploy would create it again',
    ])
  })
})
