import { beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../../../constructs/api-check.js'
import { CheckGroupV2 } from '../../../constructs/check-group-v2.js'
import { ConstructCodegen, type Resource } from '../../../constructs/construct-codegen.js'
import { Dashboard } from '../../../constructs/dashboard.js'
import { EmailAlertChannel } from '../../../constructs/email-alert-channel.js'
import { HeartbeatMonitor } from '../../../constructs/heartbeat-monitor.js'
import { Context, renderConstruct } from '../../../constructs/internal/codegen/index.js'
import { MaintenanceWindow } from '../../../constructs/maintenance-window.js'
import { PrivateLocation } from '../../../constructs/private-location.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import { StatusPage } from '../../../constructs/status-page.js'
import { StatusPageService } from '../../../constructs/status-page-service.js'
import { TcpMonitor } from '../../../constructs/tcp-monitor.js'
import { UrlMonitor } from '../../../constructs/url-monitor.js'
import { WebhookAlertChannel } from '../../../constructs/webhook-alert-channel.js'
import type { DiffEntry, ResourceSync } from '../../../rest/projects.js'
import { Program } from '../../../sourcegen/index.js'
import {
  blankRedacted,
  fillUnchangedFromBefore,
  idKey,
  physicalIdsFromPlan,
  registerProject,
  relationResourcesForAfter,
  relationResourcesFromBefore,
  toImportResource,
  UnshapeableError,
} from '../import-shape.js'

/**
 * The local side of a preview shaped like an import resource, and the
 * deployed side used as the import resource it already is (`import-shape.ts`).
 */

const ids = new Map<string, string | number>([
  [idKey('check', 'api'), 'check-uuid'],
  [idKey('check-group', 'grp'), 42],
  [idKey('alert-channel', 'email'), 7],
  [idKey('private-location', 'pl'), 'pl-uuid'],
  [idKey('status-page-service', 'svc'), 'svc-uuid'],
  [idKey('status-page', 'page'), 'page-uuid'],
  [idKey('status-page-component', 'parent'), 'parent-uuid'],
  [idKey('status-page-component', 'child'), 'child-uuid'],
  [idKey('status-page-automation-rule', 'rule'), 'rule-uuid'],
  [idKey('alert-channel-subscription', 'sub'), 1_000_000_000_001],
  [idKey('alert-channel-subscription', 'other-parent'), 1_000_000_000_002],
  [idKey('private-location-group-assignment', 'assign'), 'assign-uuid'],
  [idKey('maintenance-window', 'mw'), 'mw-uuid'],
])

const program = () =>
  new Program({ rootDirectory: '.', constructFileSuffix: '.check', specFileSuffix: '.spec', language: 'typescript' })

describe('physicalIdsFromPlan', () => {
  it('takes ids from the plan, then from the local payload, and invents stable ones for the rest', () => {
    const diff: DiffEntry[] = [
      { type: 'check', logicalId: 'api', physicalId: 'from-plan', action: 'UPDATE' },
      { type: 'check-group', logicalId: 'grp', action: 'CREATE' },
    ]
    const local: ResourceSync[] = [
      { type: 'check', logicalId: 'api', physicalId: 'from-local', member: true, payload: {} },
      { type: 'check-group', logicalId: 'grp', member: true, payload: {} },
      { type: 'alert-channel', logicalId: 'ref', physicalId: 9, member: false, payload: null },
      { type: 'private-location', logicalId: 'new-pl', member: true, payload: {} },
    ]
    const first = physicalIdsFromPlan(diff, local)
    expect(first.get(idKey('check', 'api'))).toBe('from-plan')
    expect(first.get(idKey('alert-channel', 'ref'))).toBe(9)
    const group = first.get(idKey('check-group', 'grp'))
    expect(typeof group).toBe('number')
    expect(group as number).toBeGreaterThan(1_000_000_000_000)
    expect(first.get(idKey('private-location', 'new-pl'))).toBe('synthetic:new-pl')
    // Derived from identity, not counted: the same input numbers the same way.
    expect(physicalIdsFromPlan([...diff].reverse(), [...local].reverse()).get(idKey('check-group', 'grp'))).toBe(group)
  })
})

describe('fillUnchangedFromBefore', () => {
  const before = {
    id: 'check-uuid',
    name: 'API',
    activated: true,
    muted: false,
    degradedResponseTime: 5000,
    frequency: 10,
    request: { url: 'https://example.com', method: 'GET', headers: [], assertions: [{ source: 'STATUS_CODE' }] },
    agenticCheckData: { skills: [] },
    alertChannelSubscriptions: [{ id: 1 }],
    privateLocationAssignments: [],
  }

  it('fills what the payload leaves out and the plan does not report, at the top and inside objects', () => {
    const local: Record<string, unknown> = { id: 'check-uuid', name: 'API', request: { url: 'https://example.com/v2' } }
    fillUnchangedFromBefore(local, before, [{ path: '/request/url', origin: 'code' }])
    expect(local).toEqual({
      id: 'check-uuid',
      name: 'API',
      activated: true,
      muted: false,
      degradedResponseTime: 5000,
      frequency: 10,
      request: { url: 'https://example.com/v2', method: 'GET', headers: [], assertions: [{ source: 'STATUS_CODE' }] },
      agenticCheckData: { skills: [] },
    })
  })

  it('leaves a key alone when a change is reported at it, under it, or above it', () => {
    const local: Record<string, unknown> = { id: 'check-uuid', request: { url: 'https://example.com' } }
    fillUnchangedFromBefore(local, before, [
      { path: '/activated', origin: 'code' },
      { path: '/request', origin: 'code' },
      { path: '/agentRuntime', origin: 'code' },
    ])
    expect(local).not.toHaveProperty('activated')
    expect(local.request).toEqual({ url: 'https://example.com' })
    // Reported under the deploy payload's own spelling.
    expect(local).not.toHaveProperty('agenticCheckData')
    const nested: Record<string, unknown> = { id: 'check-uuid', request: {} }
    fillUnchangedFromBefore(nested, before, [{ path: '/request/headers/0', origin: 'code', secret: true }])
    expect(nested.request).toEqual({ url: 'https://example.com', method: 'GET', assertions: [{ source: 'STATUS_CODE' }] })
  })

  it('keeps an explicit null, never fills list elements, and copies rather than shares', () => {
    const local: Record<string, unknown> = { id: 'check-uuid', muted: null, request: { assertions: [] } }
    fillUnchangedFromBefore(local, before, [])
    expect(local.muted).toBeNull()
    expect((local.request as { assertions: unknown[] }).assertions).toEqual([])
    ;(local.agenticCheckData as { skills: unknown[] }).skills.push('x')
    expect(before.agenticCheckData.skills).toEqual([])
  })

  it('never copies the id or the relation rows', () => {
    const local: Record<string, unknown> = { name: 'API' }
    fillUnchangedFromBefore(local, before, [])
    expect(local).not.toHaveProperty('id')
    expect(local).not.toHaveProperty('alertChannelSubscriptions')
    expect(local).not.toHaveProperty('privateLocationAssignments')
  })
})

describe('toImportResource', () => {
  it('sets the id, substitutes every kind of reference and drops the deploy-only keys', () => {
    const shaped = toImportResource(
      'check',
      'api',
      {
        name: 'API',
        groupId: { ref: 'grp' },
        privateLocations: ['eu-west-1'],
        sourceFile: 'src/api.check.ts',
        codeBundleSha256: 'abc',
        triggerIncident: { serviceId: { ref: 'svc' }, severity: 'MAJOR' },
        nested: { alertChannelId: { ref: 'email' }, privateLocationId: { ref: 'pl' } },
      },
      ids,
    )
    expect(shaped).toEqual({
      type: 'check',
      logicalId: 'api',
      payload: {
        id: 'check-uuid',
        name: 'API',
        groupId: 42,
        triggerIncident: { serviceId: 'svc-uuid', severity: 'MAJOR' },
        nested: { alertChannelId: 7, privateLocationId: 'pl-uuid' },
      },
    })
  })

  it('turns a card\'s service references into the `{ id }` objects the card codegen reads', () => {
    const shaped = toImportResource(
      'status-page',
      'page',
      { name: 'Page', cards: [{ name: 'Card', services: [{ ref: 'svc' }] }] },
      ids,
    )
    expect(shaped.payload).toEqual({
      id: 'page-uuid',
      name: 'Page',
      cards: [{ name: 'Card', services: [{ id: 'svc-uuid' }] }],
    })
  })

  it('fills in an absent services list, which the card codegen iterates unguarded', () => {
    const shaped = toImportResource('status-page', 'page', { name: 'Page', cards: [{ name: 'Card', services: undefined }] }, ids)
    expect(shaped.payload).toEqual({ id: 'page-uuid', name: 'Page', cards: [{ name: 'Card', services: [] }] })
    const absent = toImportResource('status-page', 'page', { name: 'Page', cards: [{ name: 'Card' }] }, ids)
    expect(absent.payload).toEqual({ id: 'page-uuid', name: 'Page', cards: [{ name: 'Card', services: [] }] })
  })

  it('drops the group version marker with the other deploy-only keys', () => {
    expect(toImportResource('check-group', 'grp', { name: 'G', v: 2 }, ids).payload).toEqual({ id: 42, name: 'G' })
  })

  it('takes a self-serializing value as what it serializes to', () => {
    const marker = { toJSON: () => 'checks/abc.tar.gz' }
    const shaped = toImportResource('check', 'api', { codeBundlePath: marker }, ids)
    expect(shaped.payload).toEqual({ id: 'check-uuid', codeBundlePath: 'checks/abc.tar.gz' })
  })

  it('groups a check\'s intent constraints the way the store keeps them', () => {
    const shaped = toImportResource(
      'check',
      'api',
      {
        intent: {
          goal: 'stay up',
          constraints: [
            { type: 'MUST_PRESERVE', statement: 'p1' },
            { type: 'REQUIRED_OUTCOME', statement: 'r1' },
            { type: 'MUST_PRESERVE', statement: 'p2' },
            { type: 'REQUIRED_OUTCOME', statement: 'r2' },
            { type: 'SOMEDAY', statement: 's1' },
          ],
        },
      },
      ids,
    )
    expect(shaped.payload.intent).toEqual({
      goal: 'stay up',
      constraints: [
        { type: 'REQUIRED_OUTCOME', statement: 'r1' },
        { type: 'REQUIRED_OUTCOME', statement: 'r2' },
        { type: 'MUST_PRESERVE', statement: 'p1' },
        { type: 'MUST_PRESERVE', statement: 'p2' },
        { type: 'SOMEDAY', statement: 's1' },
      ],
    })
    expect(toImportResource('check', 'api', { intent: null }, ids).payload.intent).toBeNull()
  })

  it('substitutes the status page and parent references of a component and a rule', () => {
    const component = toImportResource(
      'status-page-component',
      'child',
      { name: 'Child', statusPageId: { ref: 'page' }, parentId: { ref: 'parent' } },
      ids,
    )
    expect(component.payload).toMatchObject({ statusPageId: 'page-uuid', parentId: 'parent-uuid' })
    const rule = toImportResource(
      'status-page-automation-rule',
      'rule',
      { statusPageId: { ref: 'page' }, components: [{ componentId: { ref: 'parent' }, targetImpact: 'MAJOR' }] },
      ids,
    )
    expect(rule.payload).toMatchObject({
      statusPageId: 'page-uuid',
      components: [{ componentId: 'parent-uuid', targetImpact: 'MAJOR' }],
    })
  })

  it('renames the agentic runtime to what the codegen reads', () => {
    const shaped = toImportResource('check', 'api', { checkType: 'AGENTIC', agentRuntime: { skills: ['a/b'] } }, ids)
    expect(shaped.payload).toEqual({ id: 'check-uuid', checkType: 'AGENTIC', agenticCheckData: { skills: ['a/b'] } })
  })

  it('refuses a resource the plan has no id for: ids are minted in one place', () => {
    expect(() => toImportResource('check-group', 'brand-new', { name: 'New' }, ids)).toThrow(UnshapeableError)
  })

  it('refuses a reference to a resource the plan does not know, an invalid date, and a non-object', () => {
    expect(() => toImportResource('check', 'api', { groupId: { ref: 'missing' } }, ids)).toThrow(
      '\'groupId\' refers to check-group \'missing\', which this plan does not know',
    )
    expect(() => toImportResource('maintenance-window', 'mw', { startsAt: new Date('nope') }, ids)).toThrow(
      '\'startsAt\' holds an invalid date',
    )
    expect(() => toImportResource('check', 'api', null, ids)).toThrow(UnshapeableError)
  })

  it('leaves everything else exactly as it is: no defaults, no nulls invented, no sorting', () => {
    const payload = { name: 'x', tags: ['b', 'a'], locations: [], muted: null, request: { headers: [] } }
    const shaped = toImportResource('check', 'api', payload, ids)
    expect(shaped.payload).toEqual({ id: 'check-uuid', ...payload })
  })
})

describe('relations', () => {
  const before = {
    id: 'check-uuid',
    alertChannelSubscriptions: [
      { id: 1, alertChannelId: 7, checkId: 'check-uuid', activated: true },
      { id: 2, alertChannelId: 99, checkId: 'check-uuid', activated: true },
      { id: 3, alertChannelId: 55, checkId: 'check-uuid', activated: true },
    ],
    privateLocationAssignments: [{ id: 'a1', privateLocationId: 'pl-uuid', checkId: 'check-uuid' }],
  }
  const entry: DiffEntry = { type: 'check', logicalId: 'api', physicalId: 'check-uuid', action: 'UPDATE', before }
  const local: ResourceSync[] = [
    {
      type: 'alert-channel-subscription',
      logicalId: 'sub',
      member: true,
      payload: { alertChannelId: { ref: 'email' }, checkId: { ref: 'api' }, activated: true },
    },
    {
      type: 'alert-channel-subscription',
      logicalId: 'other-parent',
      member: true,
      payload: { alertChannelId: { ref: 'email' }, groupId: { ref: 'grp' }, activated: true },
    },
  ]

  it('reads the deployed side\'s relations off the parent\'s before, in target order', () => {
    expect(relationResourcesFromBefore('check', before).map(resource => [resource.type, resource.payload])).toEqual([
      // By target, not by row: channel 55 sorts before 7 and 99 as a string.
      ['alert-channel-subscription', before.alertChannelSubscriptions[2]],
      ['alert-channel-subscription', before.alertChannelSubscriptions[0]],
      ['alert-channel-subscription', before.alertChannelSubscriptions[1]],
      ['private-location-check-assignment', before.privateLocationAssignments[0]],
    ])
    expect(relationResourcesFromBefore('alert-channel', before)).toEqual([])
  })

  it('renders the local side with its own relations plus the deployed ones the deploy keeps', () => {
    const diff: DiffEntry[] = [
      entry,
      // The code removed this subscription: it goes.
      {
        type: 'alert-channel-subscription',
        logicalId: 'gone',
        physicalId: 3,
        action: 'DELETE',
        foldedInto: { type: 'check', logicalId: 'api' },
      },
    ]
    const result = relationResourcesForAfter({ ids, local, entry, diff, pruneRelations: false })
    expect(result.map(resource => resource.payload)).toEqual([
      // The local construct, shaped; it also covers the deployed row for channel 7.
      { id: expect.any(Number), alertChannelId: 7, checkId: 'check-uuid', activated: true },
      // Unmanaged: no construct, not removed, so the deploy keeps it.
      { id: 2, alertChannelId: 99, checkId: 'check-uuid', activated: true },
      { id: 'a1', privateLocationId: 'pl-uuid', checkId: 'check-uuid' },
    ])
    // The same order the deployed side gets, whichever side a row came from:
    // by target, so a local construct and a deployed row interleave alike.
    const targets = (resources: Resource[]) =>
      resources.map(resource => {
        const row = resource.payload as { alertChannelId?: unknown, privateLocationId?: unknown }
        return row.alertChannelId !== undefined ? `alert-channel:${row.alertChannelId}` : `private-location:${row.privateLocationId}`
      })
    expect(targets(result)).toEqual([...targets(result)].sort())
    expect(targets(relationResourcesFromBefore('check', before))).toEqual([...targets(relationResourcesFromBefore('check', before))].sort())
  })

  it('drops the unmanaged relations --prune-relations will delete', () => {
    const diff: DiffEntry[] = [
      entry,
      {
        type: 'alert-channel-subscription',
        logicalId: 'unmanaged/check/api/2',
        physicalId: 2,
        action: 'DELETE',
        origin: 'unmanaged',
        foldedInto: { type: 'check', logicalId: 'api' },
      },
    ]
    const kept = relationResourcesForAfter({ ids, local, entry, diff, pruneRelations: false })
    expect(kept.map(resource => (resource.payload as { id: unknown }).id)).toContain(2)
    const pruned = relationResourcesForAfter({ ids, local, entry, diff, pruneRelations: true })
    expect(pruned.map(resource => (resource.payload as { id: unknown }).id)).not.toContain(2)
  })

  it('treats a detached relation like a deleted one, and de-duplicates an assignment a construct covers', () => {
    const groupBefore = {
      id: 42,
      alertChannelSubscriptions: [{ id: 5, alertChannelId: 7, groupId: 42, activated: true }],
      privateLocationAssignments: [
        { id: 'g1', privateLocationId: 'pl-uuid', groupId: 42 },
        { id: 'g2', privateLocationId: 'other-pl', groupId: 42 },
      ],
    }
    const groupEntry: DiffEntry = { type: 'check-group', logicalId: 'grp', physicalId: 42, action: 'UPDATE', before: groupBefore }
    const groupLocal: ResourceSync[] = [
      {
        type: 'private-location-group-assignment',
        logicalId: 'assign',
        member: true,
        payload: { privateLocationId: { ref: 'pl' }, groupId: { ref: 'grp' } },
      },
    ]
    const diff: DiffEntry[] = [
      groupEntry,
      // Detached under --preserve-resources: gone from the local side all the same.
      {
        type: 'alert-channel-subscription',
        logicalId: 'sub-grp',
        physicalId: 5,
        action: 'DETACH',
        foldedInto: { type: 'check-group', logicalId: 'grp' },
      },
    ]
    const result = relationResourcesForAfter({ ids, local: groupLocal, entry: groupEntry, diff, pruneRelations: false })
    expect(result.map(resource => [resource.type, (resource.payload as { id: unknown }).id])).toEqual([
      // The other assignment is unmanaged and stays; the detached subscription does not.
      ['private-location-group-assignment', 'g2'],
      // The construct covers the deployed row for pl-uuid, so that row is not repeated.
      ['private-location-group-assignment', expect.any(String)],
    ])
  })

  it('does not let a removed subscription\'s id mask an assignment with the same id', () => {
    const shared = {
      id: 'check-uuid',
      alertChannelSubscriptions: [{ id: 5, alertChannelId: 7, checkId: 'check-uuid', activated: true }],
      privateLocationAssignments: [{ id: 5, privateLocationId: 'pl-uuid', checkId: 'check-uuid' }],
    }
    const sharedEntry: DiffEntry = { type: 'check', logicalId: 'api', physicalId: 'check-uuid', action: 'UPDATE', before: shared }
    const diff: DiffEntry[] = [
      sharedEntry,
      { type: 'alert-channel-subscription', logicalId: 'gone', physicalId: 5, action: 'DELETE', foldedInto: { type: 'check', logicalId: 'api' } },
    ]
    const result = relationResourcesForAfter({ ids, local: [], entry: sharedEntry, diff, pruneRelations: false })
    expect(result.map(resource => resource.type)).toEqual(['private-location-check-assignment'])
  })

  it('refuses a plan that removes a relation without naming its row', () => {
    const diff: DiffEntry[] = [
      entry,
      { type: 'alert-channel-subscription', logicalId: 'gone', action: 'DELETE', foldedInto: { type: 'check', logicalId: 'api' } },
    ]
    expect(() => relationResourcesForAfter({ ids, local, entry, diff, pruneRelations: false }))
      .toThrow(UnshapeableError)
  })

  it('throws when one of its own relations cannot be shaped', () => {
    const broken: ResourceSync[] = [
      { type: 'alert-channel-subscription', logicalId: 'sub', member: true, payload: { alertChannelId: { ref: 'nope' }, checkId: { ref: 'api' } } },
    ]
    expect(() => relationResourcesForAfter({ ids, local: broken, entry, diff: [entry], pruneRelations: false }))
      .toThrow(UnshapeableError)
  })

  it('has nothing to say for a type that carries no relations', () => {
    const dashboard: DiffEntry = { type: 'dashboard', logicalId: 'd', physicalId: 'd1', action: 'UPDATE' }
    expect(relationResourcesForAfter({ ids, local, entry: dashboard, diff: [], pruneRelations: false })).toEqual([])
  })
})

describe('blankRedacted', () => {
  const payload = {
    environmentVariables: [
      { key: 'PUBLIC', value: 'v', locked: false, secret: false },
      { key: 'TOKEN', value: 't', locked: true, secret: false },
      { key: 'SIGN', value: 's', locked: false, secret: true },
    ],
    request: { basicAuth: { username: 'u', password: 'p' }, headers: [{ key: 'A', value: 'a', locked: true }] },
    playwrightConfig: { use: { extraHTTPHeaders: { Authorization: 'x' }, baseURL: 'https://e.com' } },
  }

  it('blanks by the element\'s own flags for a conditional rule, and in place for a scalar one', () => {
    const blanked = blankRedacted(payload, [
      { path: '/environmentVariables/*/value', kind: 'value', when: 'lockedOrSecret' },
      { path: '/request/basicAuth/password', kind: 'value' },
      { path: '/playwrightConfig/use/extraHTTPHeaders', kind: 'object' },
    ])
    expect(blanked).toEqual({
      environmentVariables: [
        { key: 'PUBLIC', value: 'v', locked: false, secret: false },
        { key: 'TOKEN', value: '', locked: true, secret: false },
        { key: 'SIGN', value: '', locked: false, secret: true },
      ],
      request: { basicAuth: { username: 'u', password: '' }, headers: [{ key: 'A', value: 'a', locked: true }] },
      // An object is blanked to null, as the API blanks it.
      playwrightConfig: { use: { extraHTTPHeaders: null, baseURL: 'https://e.com' } },
    })
    // Never in place.
    expect(payload.request.basicAuth.password).toBe('p')
  })

  it('blanks a locked header and leaves an unlocked one under the `locked` condition', () => {
    const blanked = blankRedacted(
      { request: { headers: [{ key: 'A', value: 'a', locked: true }, { key: 'B', value: 'b', locked: false }] } },
      [{ path: '/request/headers/*/value', kind: 'value', when: 'locked' }],
    )
    expect(blanked.request.headers).toEqual([{ key: 'A', value: '', locked: true }, { key: 'B', value: 'b', locked: false }])
  })

  it('blanks regardless under a condition this CLI does not know, rather than printing a credential', () => {
    const blanked = blankRedacted(
      { environmentVariables: [{ key: 'A', value: 'a', locked: false, secret: false }] },
      [{ path: '/environmentVariables/*/value', kind: 'value', when: 'someday' as 'locked' }],
    )
    expect(blanked.environmentVariables[0].value).toBe('')
  })

  it('blanks to the placeholder the rule names, not to what the local value looks like', () => {
    const blanked = blankRedacted(
      { playwrightConfig: { use: { launchOptions: null, httpCredentials: 'odd' } } },
      [
        { path: '/playwrightConfig/use/launchOptions', kind: 'object' },
        { path: '/playwrightConfig/use/httpCredentials', kind: 'object' },
      ],
    )
    expect(blanked.playwrightConfig.use).toEqual({ launchOptions: null, httpCredentials: null })
  })

  it('does not let a condition name reach through to the prototype', () => {
    const blanked = blankRedacted(
      { environmentVariables: [{ key: 'A', value: 'a', locked: false, secret: false }] },
      [{ path: '/environmentVariables/*/value', kind: 'value', when: 'constructor' as 'locked' }],
    )
    expect(blanked.environmentVariables[0].value).toBe('')
  })

  it('ignores a rule that matches nothing locally', () => {
    expect(blankRedacted(payload, [
      { path: '/config/apiKey', kind: 'value' },
      { path: '/request/grpcConfig/metadata/*/value', kind: 'value' },
    ])).toEqual(payload)
  })

  it('refuses to render without a rule table rather than print a credential', () => {
    expect(() => blankRedacted(payload, undefined)).toThrow(UnshapeableError)
    expect(blankRedacted(payload, [])).toBe(payload)
  })

  it('blanks every position of a map, and the positions themselves under a trailing wildcard', () => {
    const blanked = blankRedacted(
      { headers: { Authorization: 'x', Accept: 'json' }, tokens: ['a', 'b'] },
      [{ path: '/headers/*', kind: 'value' }, { path: '/tokens/*', kind: 'value' }],
    )
    expect(blanked).toEqual({ headers: { Authorization: '', Accept: '' }, tokens: ['', ''] })
    // A trailing wildcard honours the condition like any other terminal.
    const conditional = blankRedacted(
      { vars: [{ key: 'A', locked: false }, { key: 'B', locked: true }] },
      [{ path: '/vars/*', kind: 'object', when: 'locked' }],
    )
    expect(conditional).toEqual({ vars: [{ key: 'A', locked: false }, null] })
  })

  it('refuses a rule whose path is not a pointer', () => {
    expect(() => blankRedacted(payload, [{ path: 'environmentVariables', kind: 'value' }])).toThrow(UnshapeableError)
  })
})

describe('registerProject and the render round trip', () => {
  let project: Project

  beforeEach(() => {
    Session.reset()
    Session.project = new Project('proj', { name: 'Project' })
    project = Session.project
  })

  const localResources = (): ResourceSync[] =>
    Object.values(project.data).flatMap(record =>
      Object.values(record).map((construct: any) => ({
        type: construct.type,
        logicalId: construct.logicalId,
        physicalId: construct.physicalId,
        member: construct.member,
        payload: construct.synthesize(),
      })),
    )

  const render = (resource: Resource, planIds: ReadonlyMap<string, string | number>) => {
    const prog = program()
    const context = new Context()
    registerProject(context, prog, project, planIds)
    return renderConstruct(new ConstructCodegen(prog), resource.logicalId, resource, { context })
  }

  it('renders a reference as the construct\'s variable, and the same way on both sides', () => {
    const group = new CheckGroupV2('grp', { name: 'Website Group' })
    const email = new EmailAlertChannel('email', { address: 'ops@example.com' })
    new ApiCheck('api', { name: 'API', group, alertChannels: [email], request: { url: 'https://example.com', method: 'GET' } })
    const local = localResources()
    const planIds = physicalIdsFromPlan([], local)
    const check = local.find(resource => resource.logicalId === 'api') as ResourceSync
    const shaped = toImportResource('check', 'api', check.payload, planIds)
    const first = render(shaped, planIds)
    expect(first).toContain('group: websiteGroup')
    expect(first).not.toContain('fromId')
    expect(render(shaped, planIds)).toBe(first)
  })

  it('leaves a reference construct to the codegen, which renders it as the fromId it is', () => {
    const referenced = CheckGroupV2.fromId(4242)
    new ApiCheck('api', { name: 'API', group: referenced, request: { url: 'https://example.com', method: 'GET' } })
    const local = localResources()
    const planIds = physicalIdsFromPlan([], local)
    const check = local.find(resource => resource.logicalId === 'api') as ResourceSync
    const rendered = render(toImportResource('check', 'api', check.payload, planIds), planIds)
    expect(rendered).toContain('fromId(4242)')
  })

  it('tells two constructs with the same name apart', () => {
    const one = new CheckGroupV2('grp-one', { name: 'Group' })
    const two = new CheckGroupV2('grp-two', { name: 'Group' })
    new ApiCheck('api', { name: 'API', group: two, request: { url: 'https://example.com', method: 'GET' } })
    const local = localResources()
    const planIds = physicalIdsFromPlan([], local)
    const check = local.find(resource => resource.logicalId === 'api') as ResourceSync
    const rendered = render(toImportResource('check', 'api', check.payload, planIds), planIds)
    expect(rendered).toContain('group: group2')
    expect(one).not.toBe(two)
  })

  it('round-trips every construct type with codegen coverage through the codegen', () => {
    const group = new CheckGroupV2('grp', { name: 'Group' })
    const email = new EmailAlertChannel('email', { address: 'ops@example.com' })
    new WebhookAlertChannel('hook', { name: 'Hook', url: 'https://hook.example.com', method: 'POST' })
    new PrivateLocation('pl', { name: 'PL', slugName: 'pl' })
    new MaintenanceWindow('mw', {
      name: 'MW',
      tags: ['prod'],
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-01-02T00:00:00.000Z'),
    })
    new Dashboard('dash', { header: 'Ops', customUrl: 'ops-dashboard' })
    const service = new StatusPageService('svc', { name: 'Service' })
    new StatusPage('page', { name: 'Page', url: 'status-example', cards: [{ name: 'Card', services: [service] }] })
    new ApiCheck('api', { name: 'API', group, alertChannels: [email], request: { url: 'https://example.com', method: 'GET' } })
    new HeartbeatMonitor('hb', { name: 'HB', period: 1, periodUnit: 'hours', grace: 10, graceUnit: 'minutes' })
    new UrlMonitor('url', { name: 'URL', request: { url: 'https://example.com' } })
    new TcpMonitor('tcp', { name: 'TCP', request: { hostname: 'example.com', port: 443 } })

    const local = localResources().filter(resource => resource.payload !== null)
    const planIds = physicalIdsFromPlan([], local)
    const failures: string[] = []
    for (const resource of local) {
      if (resource.type === 'alert-channel-subscription' || resource.type.startsWith('private-location-')) {
        continue
      }
      try {
        const shaped = toImportResource(resource.type as Resource['type'], resource.logicalId, resource.payload, planIds)
        const rendered = render(shaped, planIds)
        expect(rendered.length).toBeGreaterThan(0)
      } catch (cause) {
        failures.push(`${resource.type} ${resource.logicalId}: ${cause}`)
      }
    }
    expect(failures).toEqual([])
    expect(local.length).toBeGreaterThanOrEqual(11)
  })
})
