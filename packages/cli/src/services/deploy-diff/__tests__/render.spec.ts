import { beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../../../constructs/api-check.js'
import { RetryStrategyBuilder } from '../../../constructs/retry-strategy.js'
import { CheckGroupV2 } from '../../../constructs/check-group-v2.js'
import { EmailAlertChannel } from '../../../constructs/email-alert-channel.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import type { DiffEntry, ResourceSync } from '../../../rest/projects.js'
import { physicalIdsFromPlan } from '../import-shape.js'
import { renderResourceDiff } from '../render.js'

/**
 * The lines printed under an updated resource (`render.ts`): which of the
 * branches applies, and what each prints.
 */

let project: Project

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Project' })
  project = Session.project
})

/** A project with one group, one channel and one check subscribed to it, as the deploy payload sends them. */
function scenario (checkOverrides: Record<string, unknown> = {}) {
  const group = new CheckGroupV2('grp', { name: 'Website Group' })
  const email = new EmailAlertChannel('email', { address: 'ops@example.com' })
  const check = new ApiCheck('api', {
    name: 'API',
    group,
    alertChannels: [email],
    request: { url: 'https://example.com/health', method: 'GET' },
    ...checkOverrides,
  })
  // What the deploy sends: the constructs' own payloads plus the subscription
  // the check declares.
  const local: ResourceSync[] = [
    { type: 'check-group', logicalId: 'grp', member: true, payload: group.synthesize() },
    { type: 'alert-channel', logicalId: 'email', member: true, payload: email.synthesize() },
    { type: 'check', logicalId: 'api', member: true, payload: check.synthesize() },
    {
      type: 'alert-channel-subscription',
      logicalId: 'sub',
      member: true,
      payload: { alertChannelId: { ref: 'email' }, checkId: { ref: 'api' }, activated: true },
    },
  ]
  return { group, email, check, local }
}

/** The check as Checkly has it: the import format, the request at the deployed URL, its subscription row. */
function deployed (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'check-uuid',
    checkType: 'API',
    name: 'API',
    activated: true,
    muted: false,
    groupId: 42,
    locations: [],
    tags: [],
    request: { url: 'https://example.com/health', method: 'GET', headers: [], queryParameters: [], assertions: [] },
    alertChannelSubscriptions: [{ id: 1, alertChannelId: 7, checkId: 'check-uuid', activated: true }],
    privateLocationAssignments: [],
    ...overrides,
  }
}

const plan = (entry: DiffEntry, ...rest: DiffEntry[]): DiffEntry[] => [
  { type: 'check-group', logicalId: 'grp', physicalId: 42, action: 'UNCHANGED' },
  { type: 'alert-channel', logicalId: 'email', physicalId: 7, action: 'UNCHANGED' },
  { type: 'alert-channel-subscription', logicalId: 'sub', physicalId: 1, action: 'UNCHANGED', foldedInto: { type: 'check', logicalId: 'api' } },
  entry,
  ...rest,
]

function render (entry: DiffEntry, local: ResourceSync[], extra: DiffEntry[] = [], pruneRelations = false) {
  const diff = plan(entry, ...extra)
  return renderResourceDiff({
    entry,
    local: local.find(resource => resource.logicalId === entry.logicalId && resource.type === entry.type),
    localResources: local,
    diff,
    project,
    ids: physicalIdsFromPlan(diff, local),
    pruneRelations,
  })
}

describe('renderResourceDiff', () => {
  it('prints the construct diff of the deployed and the local rendering, references as variables', () => {
    const { local } = scenario({ request: { url: 'https://example.com/v2/health', method: 'GET' } })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        physicalId: 'check-uuid',
        action: 'UPDATE',
        sourceFile: 'src/api.check.ts',
        changes: [{ path: '/request/url', origin: 'code', before: 'https://example.com/health', after: 'https://example.com/v2/health' }],
        before: deployed(),
        redactions: [],
      },
      local,
    )
    expect(lines[0]).toBe('file: src/api.check.ts')
    const text = lines.join('\n')
    expect(text).toContain('-    url: \'https://example.com/health\'')
    expect(text).toContain('+    url: \'https://example.com/v2/health\'')
    // Everything the two sides agree on cancels: the group and the channel
    // render as the same variables on both, so neither is a changed line —
    // and neither side had to fall back to `fromId`.
    const changed = lines.filter(line => /^[-+](?![-+]{2} )/.test(line))
    expect(changed, changed.join('\n')).toHaveLength(2)
    expect(text).not.toContain('fromId')
    expect(text).not.toContain('secret changed')
  })

  it('prints one line for changes that carry only a cause', () => {
    const { local } = scenario()
    expect(render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [
          { path: '/codeBundle', origin: 'code', cause: 'code bundle' },
          { path: '/cacheHash', origin: 'code', cause: 'dependency cache' },
        ],
        before: deployed(),
        redactions: [],
      },
      local,
    )).toEqual(['changed: code bundle, dependency cache'])
  })

  it('names a CLI upgrade rather than diffing two spellings of the same thing', () => {
    // A pre-4.0.9 project sent `doubleCheck: true`, which the API stored as
    // a retry strategy beside it; the upgraded CLI sends the strategy itself
    // and no `doubleCheck`, so the flag is the only reported change and the
    // two constructs render alike.
    const options = { baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true }
    const retryStrategy = { type: 'LINEAR', ...options }
    const { local } = scenario({ retryStrategy: RetryStrategyBuilder.linearStrategy(options) })
    expect(render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/doubleCheck', origin: 'code', before: true }],
        before: deployed({ doubleCheck: true, retryStrategy }),
        redactions: [],
      },
      local,
    )).toEqual(['payload format changed (CLI upgrade)'])
  })

  it('leaves a deployed snippet reference out of both sides', () => {
    const { local } = scenario({ request: { url: 'https://example.com/v2/health', method: 'GET' } })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/request/url', origin: 'code', before: 'https://example.com/health', after: 'https://example.com/v2/health' }],
        // A setup snippet attached in the web app: the codegen would resolve
        // it through a file no preview registers, and a deploy clears it.
        before: deployed({ setupSnippetId: 42, tearDownSnippetId: 43 }),
        redactions: [],
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).not.toContain('could not render')
    expect(text).not.toContain('snippet')
    expect(text).toContain('+    url: \'https://example.com/v2/health\'')
    // A group's codegen resolves a snippet reference the same way.
    const { local: withGroup } = scenario()
    const group = withGroup.find(resource => resource.type === 'check-group') as ResourceSync
    group.payload = { ...group.payload, name: 'Website Group v2' }
    const groupLines = render(
      {
        type: 'check-group',
        logicalId: 'grp',
        physicalId: 42,
        action: 'UPDATE',
        changes: [{ path: '/name', origin: 'code', before: 'Website Group', after: 'Website Group v2' }],
        before: { id: 42, name: 'Website Group', setupSnippetId: 42, alertChannelSubscriptions: [], privateLocationAssignments: [] },
        redactions: [],
      },
      withGroup,
    )
    expect(groupLines.join('\n')).not.toContain('could not render')
    expect(groupLines.join('\n')).toContain('+  name: \'Website Group v2\'')
  })

  it('shows a script change as a text diff of its own, beside the construct diff when there is one', () => {
    const script = (line: string) => `const { test } = require('@playwright/test')\n${line}\n`
    const browser = (overrides: Record<string, unknown>) => ({
      checkType: 'BROWSER',
      name: 'Browser',
      activated: true,
      muted: false,
      locations: [],
      tags: [],
      alertChannelSubscriptions: [],
      privateLocationAssignments: [],
      ...overrides,
    })
    const local: ResourceSync[] = [
      { type: 'check', logicalId: 'browser', member: true, payload: browser({ script: script('test("b", () => {})'), muted: true }) },
    ]
    const withMuted = render(
      {
        type: 'check',
        logicalId: 'browser',
        physicalId: 'browser-uuid',
        action: 'UPDATE',
        changes: [
          { path: '/script', origin: 'code', before: { $hash: 'a' }, after: { $hash: 'b' } },
          { path: '/muted', origin: 'code', before: false, after: true },
        ],
        before: browser({ id: 'browser-uuid', script: script('test("a", () => {})') }),
        redactions: [],
      },
      local,
    )
    const text = withMuted.join('\n')
    expect(text).toContain('+  muted: true')
    expect(text).toContain('/script:')
    expect(text).toContain('-test("a", () => {})')
    expect(text).toContain('+test("b", () => {})')
    // The script alone: the constructs agree, the text diff is all there is.
    const alone = render(
      {
        type: 'check',
        logicalId: 'browser',
        physicalId: 'browser-uuid',
        action: 'UPDATE',
        changes: [{ path: '/script', origin: 'code', before: { $hash: 'a' }, after: { $hash: 'b' } }],
        before: browser({ id: 'browser-uuid', script: script('test("a", () => {})'), muted: true }),
        redactions: [],
      },
      local,
    )
    expect(alone[0]).toBe('/script:')
    expect(alone.join('\n')).not.toContain('muted')
  })

  it('still names a cause beside the construct diff', () => {
    const { local } = scenario({ request: { url: 'https://example.com/v2/health', method: 'GET' } })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [
          { path: '/request/url', origin: 'code', before: 'https://example.com/health', after: 'https://example.com/v2/health' },
          { path: '/cacheHash', origin: 'code', cause: 'dependency cache' },
        ],
        before: deployed(),
        redactions: [],
      },
      local,
    )
    expect(lines.join('\n')).toContain('+    url: \'https://example.com/v2/health\'')
    expect(lines.at(-1)).toBe('/cacheHash: changed (dependency cache)')
  })

  it('takes what the payload leaves out and the plan does not report from the deployed side', () => {
    const { local } = scenario({ request: { url: 'https://example.com/v2/health', method: 'GET' } })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/request/url', origin: 'code', before: 'https://example.com/health', after: 'https://example.com/v2/health' }],
        // The row carries the response-time defaults the deploy filled in; the construct never said them.
        before: deployed({ degradedResponseTime: 5000, maxResponseTime: 20000 }),
        redactions: [],
      },
      local,
    )
    const changed = lines.filter(line => /^[-+](?![-+]{2} )/.test(line))
    expect(changed, changed.join('\n')).toHaveLength(2)
    expect(lines.join('\n')).not.toContain('ResponseTime')
  })

  it('shows an edit to a shape-change property as the construct diff it is', () => {
    const { local } = scenario({ retryStrategy: RetryStrategyBuilder.linearStrategy({ maxRetries: 3 }) })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/retryStrategy', origin: 'code', before: null, after: { type: 'LINEAR', maxRetries: 3 } }],
        before: deployed(),
        redactions: [],
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).not.toContain('CLI upgrade')
    expect(text).toContain('+  retryStrategy')
    expect(text).toContain('maxRetries: 3')
  })

  it('reports a secret by its path, after the diff, and blanks it on the local side', () => {
    const { local } = scenario({
      environmentVariables: [{ key: 'TOKEN', value: 'plaintext-token', locked: true }],
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/environmentVariables', origin: 'code', secret: true }],
        before: deployed({ environmentVariables: [{ key: 'TOKEN', value: '', locked: true, secret: false }] }),
        redactions: [{ path: '/environmentVariables/*/value', kind: 'value', when: 'lockedOrSecret' }],
      },
      local,
    )
    expect(lines.at(-1)).toBe('secret changed: /environmentVariables')
    expect(lines.join('\n')).not.toContain('plaintext-token')
  })

  it('shows a content change as a text diff of the two texts when the constructs render alike', () => {
    const body = `{"payload":"${'a'.repeat(300)}"}`
    const edited = `{"payload":"${'b'.repeat(300)}"}`
    const { local } = scenario({ request: { url: 'https://example.com/health', method: 'POST', body: edited } })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/request/body', origin: 'code', before: { $hash: 'x' }, after: { $hash: 'y' } }],
        before: deployed({ request: { url: 'https://example.com/health', method: 'POST', body, headers: [], queryParameters: [], assertions: [] } }),
        redactions: [],
      },
      local,
    )
    const text = lines.join('\n')
    // The construct itself renders the body, so this is the construct diff.
    expect(text).toContain('a'.repeat(300))
    expect(text).toContain('b'.repeat(300))
  })

  it('falls back to a listing, with the reason, when a side cannot be shaped', () => {
    const { local } = scenario()
    const check = local.find(resource => resource.logicalId === 'api') as ResourceSync
    check.payload = { ...check.payload, groupId: { ref: 'unknown-group' } }
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/name', origin: 'remote', before: 'API', after: 'Renamed in the UI' }],
        before: deployed(),
        redactions: [],
      },
      local,
    )
    expect(lines[0]).toMatch(/^\('groupId' refers to check-group 'unknown-group'/)
    expect(lines[1]).toBe('/name: "API" -> "Renamed in the UI" (changed in Checkly, overwritten by this deploy)')
  })

  it('falls back to a listing when the codegen throws, and never throws itself', () => {
    const { local } = scenario()
    const check = local.find(resource => resource.logicalId === 'api') as ResourceSync
    check.payload = { ...check.payload, checkType: 'PLAYWRIGHT' }
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/name', origin: 'code', before: 'API', after: 'Suite' }],
        before: deployed({ checkType: 'PLAYWRIGHT' }),
        redactions: [],
      },
      local,
    )
    expect(lines[0]).toMatch(/^\(could not render this resource: /)
    expect(lines).toContain('/name: "API" -> "Suite"')
  })

  it('lists the changes when the entry carries no deployed state', () => {
    const { local } = scenario()
    expect(render(
      { type: 'check', logicalId: 'api', action: 'UPDATE', changes: [{ path: '/name', origin: 'code', before: 'API', after: 'New' }] },
      local,
    )).toEqual(['/name: "API" -> "New"'])
  })

  it('keeps an unmanaged subscription on both sides, and drops it under --prune-relations', () => {
    const { local } = scenario()
    const entry: DiffEntry = {
      type: 'check',
      logicalId: 'api',
      physicalId: 'check-uuid',
      action: 'UNCHANGED',
      changes: [
        { path: '/name', origin: 'code', before: 'API', after: 'API' },
        { path: '/alertChannels/x', origin: 'unmanaged', before: { alertChannel: { $id: '99' }, activated: true } },
      ],
      before: deployed({
        alertChannelSubscriptions: [
          { id: 1, alertChannelId: 7, checkId: 'check-uuid', activated: true },
          { id: 2, alertChannelId: 99, checkId: 'check-uuid', activated: true },
        ],
      }),
      redactions: [],
    }
    // Kept: both sides carry it, so the renderings agree and nothing about
    // the channel is a changed line.
    const kept = render(entry, local)
    expect(kept.filter(line => line.startsWith('-') || line.startsWith('+'))).toEqual([])
    const pruned = render(entry, local, [
      { type: 'alert-channel-subscription', logicalId: 'unmanaged/check/api/2', physicalId: 2, action: 'DELETE', origin: 'unmanaged', foldedInto: { type: 'check', logicalId: 'api' } },
    ], true).join('\n')
    expect(pruned).toContain('-    AlertChannel.fromId(99)')
  })
})
