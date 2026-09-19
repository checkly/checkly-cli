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

  const CHANGED = { $masked: 'changed' }
  const SAME = { $masked: 'same' }
  const RULES = [
    { path: '/environmentVariables/*/value', kind: 'value', when: 'lockedOrSecret' },
    { path: '/request/basicAuth/password', kind: 'value' },
  ]
  const deployedVars = () =>
    deployed({
      environmentVariables: [
        { key: 'TOKEN', value: '', locked: true, secret: false },
        { key: 'REGION', value: 'eu', locked: false, secret: false },
      ],
    })

  it('shows a rotated secret inline, masked and marked beside its key, never valued', () => {
    const { local } = scenario({
      environmentVariables: [
        { key: 'TOKEN', value: 'rotated-plaintext', locked: true },
        { key: 'REGION', value: 'eu', locked: false },
      ],
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{
          path: '/environmentVariables',
          origin: 'code',
          secret: true,
          before: [{ key: 'TOKEN', value: CHANGED, locked: true, secret: false }, { key: 'REGION', value: 'eu', locked: false }],
          after: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'eu', locked: false }],
        }],
        before: deployedVars(),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).not.toContain('rotated-plaintext')
    expect(text).not.toContain('\'\'')
    expect(text).toContain('-      value: \'********\',')
    expect(text).toContain('+      value: \'******** (changed)\',')
    expect(lines.filter(line => /^[-+](?![-+]{2} )/.test(line))).toHaveLength(2)
    expect(text).not.toContain('secret changed')
    expect(text).not.toContain('#')
  })

  it('never writes a mark or a mask into the plan or the deploy payload', () => {
    const { local } = scenario({
      environmentVariables: [{ key: 'TOKEN', value: 'rotated-plaintext', locked: true }],
    })
    const entry: DiffEntry = {
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [{
        path: '/environmentVariables',
        origin: 'code',
        secret: true,
        before: [{ key: 'TOKEN', value: CHANGED, locked: true }],
        after: [{ key: 'TOKEN', value: CHANGED, locked: true }],
      }],
      before: deployed({ environmentVariables: [{ key: 'TOKEN', value: '', locked: true, secret: false }] }),
      redactions: RULES,
    }
    const entrySnapshot = JSON.stringify(entry)
    const localSnapshot = JSON.stringify(local)
    render(entry, local)
    expect(JSON.stringify(entry)).toBe(entrySnapshot)
    expect(JSON.stringify(local)).toBe(localSnapshot)
  })

  it('shows a plain edit folded into a secret change beside the marked secret', () => {
    const { local } = scenario({
      environmentVariables: [
        { key: 'TOKEN', value: 'rotated-plaintext', locked: true },
        { key: 'REGION', value: 'us', locked: false },
      ],
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [
          { path: '/codeBundle', origin: 'code', cause: 'code bundle' },
          {
            path: '/environmentVariables',
            origin: 'code',
            secret: true,
            before: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'eu', locked: false }],
            after: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'us', locked: false }],
          },
        ],
        before: deployedVars(),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).toContain('+      value: \'******** (changed)\',')
    expect(text).toContain('-      value: \'eu\',')
    expect(text).toContain('+      value: \'us\',')
    expect(text).not.toContain('rotated-plaintext')
    expect(lines).toContain('/codeBundle: changed (code bundle)')
    expect(text).not.toContain('secret changed')
  })

  it('marks a secret rotated in Checkly on the deployed side, by key, whatever the row\'s order', () => {
    const { local } = scenario({
      environmentVariables: [
        { key: 'API_KEY', value: 'k', secret: true },
        { key: 'REGION', value: 'eu', locked: false },
      ],
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{
          path: '/environmentVariables',
          origin: 'remote',
          secret: true,
          before: [{ key: 'REGION', value: 'eu' }, { key: 'API_KEY', value: CHANGED, secret: true }],
          after: [{ key: 'REGION', value: 'eu' }, { key: 'API_KEY', value: CHANGED, secret: true }],
        }],
        before: deployed({
          environmentVariables: [
            { key: 'API_KEY', value: '', locked: false, secret: true },
            { key: 'REGION', value: 'eu', locked: false, secret: false },
          ],
        }),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).toContain('-      value: \'******** (changed in Checkly)\',')
    expect(text).toContain('+      value: \'********\',')
    // A `secret: true` variable prints its masked value beside the flag.
    expect(text).toContain('secret: true')
    expect(text).not.toContain('secret changed')
    // The deploy overwrites it, which the inline mark alone does not say.
    expect(lines.at(-1)).toBe('/environmentVariables: (changed in Checkly, overwritten by this deploy)')
  })

  it('marks a rotated scalar secret at its own path', () => {
    const { local } = scenario({
      request: { url: 'https://example.com/health', method: 'GET', basicAuth: { username: 'svc', password: 'rotated' } },
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/request/basicAuth/password', origin: 'code', secret: true, before: CHANGED, after: CHANGED }],
        before: deployed({
          request: {
            url: 'https://example.com/health',
            method: 'GET',
            headers: [],
            queryParameters: [],
            assertions: [],
            basicAuth: { username: 'svc', password: '' },
          },
        }),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).not.toContain('rotated')
    expect(text).toContain('+      password: \'******** (changed)\',')
    expect(text).not.toContain('secret changed')
  })

  it('names a secret change after the block when no mark could be placed', () => {
    const { local } = scenario({
      environmentVariables: [{ key: 'NEW', value: 'rotated-plaintext', locked: true }],
    })
    // Renamed: the report matches nothing, the list shows the swap, masked.
    const renamed = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{
          path: '/environmentVariables',
          origin: 'code',
          secret: true,
          before: [{ key: 'OLD', value: SAME, locked: true }],
          after: [{ key: 'NEW', value: SAME, locked: true }],
        }],
        before: deployed({ environmentVariables: [{ key: 'OLD', value: '', locked: true, secret: false }] }),
        redactions: RULES,
      },
      local,
    )
    const text = renamed.join('\n')
    expect(text).not.toContain('rotated-plaintext')
    expect(text).toContain('-      key: \'OLD\',')
    expect(text).toContain('+      key: \'NEW\',')
    expect(text).not.toContain('\'\'')
    expect(renamed.at(-1)).toBe('secret changed: /environmentVariables')
    // An API that reports no markers at all: masked both sides, named after.
    const { local: same } = scenario({ environmentVariables: [{ key: 'TOKEN', value: 'plaintext-token', locked: true }] })
    const unmarked = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/environmentVariables', origin: 'code', secret: true }],
        before: deployed({ environmentVariables: [{ key: 'TOKEN', value: '', locked: true, secret: false }] }),
        redactions: RULES,
      },
      same,
    )
    expect(unmarked).toEqual(['secret changed: /environmentVariables'])
  })

  it('does not render a secret change that no reported redaction rule reaches', () => {
    const { local } = scenario({
      environmentVariables: [
        { key: 'TOKEN', value: 'rotated-plaintext', locked: true },
        { key: 'REGION', value: 'us', locked: false },
      ],
    })
    const entry: DiffEntry = {
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [
        { path: '/request/url', origin: 'code', before: 'https://example.com/health', after: 'https://example.com/v2/health' },
        {
          path: '/environmentVariables',
          origin: 'code',
          secret: true,
          before: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'eu' }],
          after: [{ key: 'TOKEN', value: CHANGED, locked: true }, { key: 'REGION', value: 'us' }],
        },
      ],
      before: deployedVars(),
      redactions: [{ path: '/request/basicAuth/password', kind: 'value' }],
    }
    const lines = render(entry, local)
    expect(lines.join('\n')).not.toContain('rotated-plaintext')
    expect(lines).toEqual([
      '/request/url: "https://example.com/health" -> "https://example.com/v2/health"',
      'secret changed: /environmentVariables',
    ])
    // A reorder carries markers without the flag, and is guarded the same way.
    const reorder = render(
      {
        ...entry,
        changes: [{
          path: '/environmentVariables',
          origin: 'code',
          before: [{ key: 'TOKEN', value: SAME, locked: true }, { key: 'REGION', value: 'eu' }],
          after: [{ key: 'REGION', value: 'eu' }, { key: 'TOKEN', value: SAME, locked: true }],
        }],
      },
      local,
    )
    expect(reorder.join('\n')).not.toContain('rotated-plaintext')
    expect(reorder[0]).toContain('/environmentVariables: ')
    expect(reorder[0]).toContain('"********"')
    expect(reorder[0]).not.toContain('$masked')
    // A rule above the path reaches it as well as one below: an object rule
    // over basicAuth blanks the whole block on both sides, so the password's
    // mark has nowhere to land and the line carries it, but the entry renders.
    const { local: withAuth } = scenario({
      request: { url: 'https://example.com/v2/health', method: 'GET', basicAuth: { username: 'svc', password: 'rotated' } },
    })
    const above = render(
      {
        ...entry,
        changes: [
          entry.changes![0],
          { path: '/request/basicAuth/password', origin: 'code', secret: true, before: CHANGED, after: CHANGED },
        ],
        before: deployed({
          request: {
            url: 'https://example.com/health',
            method: 'GET',
            headers: [],
            queryParameters: [],
            assertions: [],
            basicAuth: { username: 'svc', password: '' },
          },
        }),
        redactions: [{ path: '/request/basicAuth', kind: 'object' }],
      },
      withAuth,
    )
    expect(above.join('\n')).toContain('--- deployed')
    expect(above.join('\n')).not.toContain('rotated')
    expect(above.at(-1)).toBe('secret changed: /request/basicAuth/password')
  })

  it('shows a variable flipped to locked as its plain value becoming a marked mask', () => {
    const { local } = scenario({
      environmentVariables: [{ key: 'REGION', value: 'now-locked', locked: true }],
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{
          path: '/environmentVariables',
          origin: 'code',
          secret: true,
          before: [{ key: 'REGION', value: CHANGED, locked: false }],
          after: [{ key: 'REGION', value: CHANGED, locked: true }],
        }],
        before: deployed({ environmentVariables: [{ key: 'REGION', value: 'eu', locked: false, secret: false }] }),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).not.toContain('now-locked')
    expect(text).toContain('-      value: \'eu\',')
    expect(text).toContain('+      value: \'******** (changed)\',')
    expect(text).not.toContain('secret changed')
  })

  it('names a secret change after the block when its mark sits where nothing renders', () => {
    // A basicAuth block with no username is not printed at all, so a placed
    // mark never reaches the reader and the line carries the movement.
    const { local } = scenario({
      request: { url: 'https://example.com/health', method: 'GET', basicAuth: { username: '', password: 'rotated' } },
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/request/basicAuth/password', origin: 'code', secret: true, before: CHANGED, after: CHANGED }],
        before: deployed({
          request: {
            url: 'https://example.com/health',
            method: 'GET',
            headers: [],
            queryParameters: [],
            assertions: [],
            basicAuth: { username: '', password: '' },
          },
        }),
        redactions: RULES,
      },
      local,
    )
    expect(lines.join('\n')).not.toContain('rotated')
    expect(lines).toEqual(['secret changed: /request/basicAuth/password'])
  })

  it('names only the secret change whose mark did not reach the reader, when another did', () => {
    const { local } = scenario({
      environmentVariables: [{ key: 'TOKEN', value: 'rotated-plaintext', locked: true }],
      request: { url: 'https://example.com/health', method: 'GET', basicAuth: { username: '', password: 'rotated' } },
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [
          {
            path: '/environmentVariables',
            origin: 'code',
            secret: true,
            before: [{ key: 'TOKEN', value: CHANGED, locked: true }],
            after: [{ key: 'TOKEN', value: CHANGED, locked: true }],
          },
          { path: '/request/basicAuth/password', origin: 'code', secret: true, before: CHANGED, after: CHANGED },
        ],
        before: deployed({
          environmentVariables: [{ key: 'TOKEN', value: '', locked: true, secret: false }],
          request: {
            url: 'https://example.com/health',
            method: 'GET',
            headers: [],
            queryParameters: [],
            assertions: [],
            basicAuth: { username: '', password: '' },
          },
        }),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    expect(text).toContain('+      value: \'******** (changed)\',')
    expect(text).not.toContain('#')
    expect(lines.filter(line => line.startsWith('secret changed'))).toEqual(['secret changed: /request/basicAuth/password'])
  })

  it('prints a secret: true header or query parameter only as its mask under the preview', () => {
    // Neither is covered by the API's rule table; the codegen itself never
    // prints such a value under the preview's flag.
    const { local } = scenario({
      request: {
        url: 'https://example.com/v2/health',
        method: 'GET',
        headers: [{ key: 'Authorization', value: '********-raw-header-secret', secret: true }],
        queryParameters: [{ key: 'token', value: 'raw-query-secret', secret: true }],
      },
    })
    const lines = render(
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{
          path: '/request/url',
          origin: 'code',
          before: 'https://example.com/health',
          after: 'https://example.com/v2/health',
        }],
        before: deployed(),
        redactions: RULES,
      },
      local,
    )
    const text = lines.join('\n')
    // A plaintext that merely looks masked is not one the preview wrote.
    expect(text).not.toContain('raw-header-secret')
    expect(text).not.toContain('raw-query-secret')
    expect(text).toContain('value: \'********\'')
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
