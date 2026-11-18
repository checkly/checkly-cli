import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { DiffChange } from '../../../rest/projects.js'
import { SINGLE_RETRY_ELSEWHERE } from '../../../constructs/internal/default-retry-strategy.js'
import { deployedSide, spelledOutFromDifference } from '../drift.js'
import { idKey, MASK } from '../import-shape.js'

/**
 * The parts of a drift diff (`drift.ts`) that the rendered output does not
 * pin down on its own: how the deployed side is built from the deployed
 * value and the current one, and which construct properties are spelled
 * out on both sides.
 */

const remote = (change: Omit<DiffChange, 'origin'>): DiffChange => ({ origin: 'remote', ...change })

const SAME = { $masked: 'same' }

const ids = new Map<string, string | number>([
  [idKey('check-group', 'grp-a'), 41],
])

/** An API check as Checkly has it now, in the import format. */
function check (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chk-uuid',
    checkType: 'API',
    name: 'Orders API',
    tags: ['api', 'web'],
    groupId: null,
    retryStrategy: null,
    doubleCheck: false,
    environmentVariables: [{ key: 'API_KEY', value: MASK, locked: true, secret: false }],
    request: {
      url: 'https://api.example.com',
      followRedirects: true,
      basicAuth: { username: '', password: '' },
      assertions: [{ source: 'STATUS_CODE', comparison: 'EQUALS', target: '200', property: '' }],
    },
    alertChannelSubscriptions: [{ id: 1, alertChannelId: 7, checkId: 'chk-uuid', activated: true }],
    privateLocationAssignments: [],
    ...overrides,
  }
}

/** The same check as its last deploy left it, in the vocabulary of the deploy payload. */
function deployedCheck (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    checkType: 'API',
    name: 'Orders API',
    tags: ['api', 'web'],
    groupId: null,
    retryStrategy: null,
    doubleCheck: false,
    environmentVariables: [{ key: 'API_KEY', value: SAME, locked: true, secret: false }],
    request: {
      url: 'https://api.example.com',
      followRedirects: true,
      basicAuth: { username: '', password: SAME },
      assertions: [{ source: 'STATUS_CODE', comparison: 'EQUALS', target: '200', property: '' }],
    },
    ...overrides,
  }
}

const side = (live: Record<string, unknown>, deployed: Record<string, unknown>, changes: DiffChange[]) =>
  deployedSide('check', deployed, live, changes, ids)

describe('deployedSide', () => {
  it('shows the current value wherever no change reaches, whatever the deployed value holds there', () => {
    const live = check({ description: 'only on the current side', tags: ['web', 'api'] })
    const deployed = deployedCheck({
      name: 'Old',
      tags: ['api', 'web'],
      setupScriptDependencies: { $hash: 'h1' },
      privateLocations: [{ $ref: 'office' }],
      sourceFile: 'orders.check.ts',
    })
    const { payload, unapplied, hashed } = side(live, deployed, [remote({ path: '/name', before: 'Old', after: 'Orders API' })])
    expect(unapplied).toEqual([])
    expect(hashed).toEqual([])
    expect(payload).toEqual({ ...live, name: 'Old' })
  })

  it('restores an object removed since the deploy from the deployed value, each named leaf from its change', () => {
    const live = check({ alertSettings: { escalationType: 'RUN_BASED' } })
    const deployed = deployedCheck({
      alertSettings: { escalationType: 'RUN_BASED', reminders: { amount: 2, interval: 10 } },
    })
    const { payload, unapplied } = side(live, deployed, [
      remote({ path: '/alertSettings/reminders/amount', before: 3 }),
    ])
    expect(unapplied).toEqual([])
    // A deployed leaf no change names stays as deployed; a named one takes the change's `before`.
    expect(payload.alertSettings).toEqual({ escalationType: 'RUN_BASED', reminders: { amount: 3, interval: 10 } })
  })

  it('restores a list removed since the deploy, reported by the leaves of its elements', () => {
    const live = check({ playwrightConfig: { use: { baseURL: 'https://example.com' } } })
    const deployed = deployedCheck({
      playwrightConfig: { use: { baseURL: 'https://example.com' }, projects: [{ name: 'chromium' }, { name: 'firefox' }] },
    })
    const { payload, unapplied } = side(live, deployed, [
      remote({ path: '/playwrightConfig/projects/0/name', before: 'chromium' }),
      remote({ path: '/playwrightConfig/projects/1/name', before: 'firefox' }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.playwrightConfig).toEqual({
      use: { baseURL: 'https://example.com' },
      projects: [{ name: 'chromium' }, { name: 'firefox' }],
    })
  })

  it('takes a list reported at its own path from the change, an unchanged hashed field matched by key', () => {
    const long = 'x'.repeat(300)
    const live = check()
    ;(live.request as Record<string, unknown>).headers = [
      { key: 'X-New', value: '1', locked: false },
      { key: 'X-Long', value: long, locked: false },
      { key: 'X-Trace', value: 'off', locked: false },
    ]
    const change = remote({
      path: '/request/headers',
      before: [{ key: 'X-Long', value: { $hash: 'h1' }, locked: false }, { key: 'X-Trace', value: 'on', locked: false }],
      after: [
        { key: 'X-New', value: '1', locked: false },
        { key: 'X-Long', value: { $hash: 'h1' }, locked: false },
        { key: 'X-Trace', value: 'off', locked: false },
      ],
    })
    const { payload, hashed } = side(live, deployedCheck(), [change])
    expect(hashed).toEqual([])
    expect((payload.request as Record<string, unknown>).headers).toEqual([
      { key: 'X-Long', value: long, locked: false },
      { key: 'X-Trace', value: 'on', locked: false },
    ])

    // A hashed field whose element now holds another value changed: its deployed text is unknown.
    const moved = remote({ ...change, after: [{ key: 'X-Long', value: { $hash: 'h2' }, locked: false }] })
    const unknown = side(live, deployedCheck(), [moved])
    expect(unknown.hashed).toEqual([moved])
    const headersOf = (payload: Record<string, unknown>) => (payload.request as Record<string, unknown>).headers
    expect(headersOf(unknown.payload)).toEqual(headersOf(live))
  })

  it('takes a set\'s deployed elements, those still there in the current order, the rest after', () => {
    const live = check({ tags: ['web', 'new', 'api'] })
    const { payload, unapplied } = side(live, deployedCheck({ tags: ['old', 'api', 'web'] }), [
      remote({ path: '/tags/a1b2c3', after: 'new' }),
      remote({ path: '/tags/d4e5f6', before: 'old' }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.tags).toEqual(['web', 'api', 'old'])
  })

  it('takes an element digest made of digits alone as a set element, not a list index', () => {
    const live = check({ tags: ['web', 'new'] })
    const { payload, unapplied } = side(live, deployedCheck({ tags: ['api', 'web'] }), [
      remote({ path: '/tags/583920', before: 'api' }),
      remote({ path: '/tags/104857', after: 'new' }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.tags).toEqual(['web', 'api'])

    // A digit-only digest under a set emptied since the deploy.
    const emptied = side(check({ tags: [] }), deployedCheck({ tags: ['api'] }), [
      remote({ path: '/tags', after: [] }),
      remote({ path: '/tags/583920', before: 'api' }),
    ])
    expect(emptied.payload.tags).toEqual(['api'])
  })

  it('never reorders a list, so a reordered list shows as a change', () => {
    const live = check({ browsers: ['firefox', 'chromium'] })
    const { payload } = side(live, deployedCheck({ browsers: ['chromium', 'firefox'] }), [
      remote({ path: '/browsers', before: ['chromium', 'firefox'], after: ['firefox', 'chromium'] }),
    ])
    expect(payload.browsers).toEqual(['chromium', 'firefox'])
  })

  it('keeps the current value for a value reported only by its hash', () => {
    const live = check({ script: 'now' })
    const scalar = remote({ path: '/script', before: { $hash: 'a' }, after: { $hash: 'b' } })
    const cause = remote({ path: '/codeBundle', cause: 'code bundle' })
    const { payload, hashed, unapplied } = side(live, deployedCheck({ script: { $hash: 'a' } }), [scalar, cause])
    expect(payload.script).toBe('now')
    expect(hashed).toEqual([scalar])
    expect(unapplied).toEqual([])
  })

  it('keeps the current value where a reference cannot be resolved, and shows the rest', () => {
    const unknown = remote({ path: '/groupId', before: { $ref: 'grp-unknown' }, after: null })
    const misplaced = remote({ path: '/name', before: { $id: 'x' }, after: 'Orders API' })
    const muted = remote({ path: '/muted', before: true, after: false })
    const { payload, unapplied } = side(check({ muted: false }), deployedCheck(), [unknown, misplaced, muted])
    expect(unapplied).toEqual([unknown, misplaced])
    expect(payload.groupId).toBeNull()
    expect(payload.name).toBe('Orders API')
    expect(payload.muted).toBe(true)
  })

  it('resolves a reference by logical id, and places one by physical id as the import format holds it', () => {
    const { payload } = side(check({ groupId: 42 }), deployedCheck({ groupId: { ref: 'grp-a' } }), [
      remote({ path: '/groupId', before: { $ref: 'grp-a' }, after: { $id: '42' } }),
    ])
    expect(payload.groupId).toBe(41)
    const component = deployedSide('status-page-component', { parentId: { $id: 'p-then' } }, { id: 'c', parentId: 'p-now' }, [
      remote({ path: '/parentId', before: { $id: 'p-then' }, after: { $id: 'p-now' } }),
    ], ids)
    expect(component.payload.parentId).toBe('p-then')
  })

  it('notes a change under a key the deployed side never renders', () => {
    const location = remote({ path: '/privateLocations/f6a7b8', before: { $ref: 'office' } })
    const subscription = remote({ path: '/alertChannelSubscriptions/0/activated', before: false, after: true })
    const live = check()
    const { payload, unapplied } = side(live, deployedCheck({ privateLocations: [{ $ref: 'office' }] }), [location, subscription])
    expect(unapplied).toEqual([location, subscription])
    expect(payload).toEqual(live)
  })

  it('takes a deployed intent whole where a change reaches it, in either vocabulary', () => {
    const live = check({
      intent: {
        goal: 'Orders load quickly',
        constraints: [
          { type: 'REQUIRED_OUTCOME', statement: 'Lists every order' },
          { type: 'MUST_PRESERVE', statement: 'Read only' },
        ],
      },
    })
    const intent = { goal: 'Orders load', requiredOutcomes: ['Lists an order'], mustPreserve: ['Read only'] }
    const { payload, unapplied } = side(live, deployedCheck({ intent }), [
      remote({ path: '/intent/goal', before: 'Orders load', after: 'Orders load quickly' }),
      remote({ path: '/intent/requiredOutcomes', before: ['Lists an order'], after: ['Lists every order'] }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.intent).toEqual(intent)
  })

  it('takes a long unchanged value of a deployed intent from the current one, and overlays each change', () => {
    const goal = `Orders load ${'quickly '.repeat(40)}`
    const live = check({
      intent: { goal, constraints: [{ type: 'REQUIRED_OUTCOME', statement: 'Lists every order' }] },
    })
    const deployed = deployedCheck({
      intent: { goal: { $hash: 'h1' }, requiredOutcomes: ['Lists a stale order'], mustPreserve: [] },
    })
    const { payload, hashed, unapplied } = side(live, deployed, [
      remote({ path: '/intent/requiredOutcomes', before: ['Lists an order'], after: ['Lists every order'] }),
    ])
    expect(hashed).toEqual([])
    expect(unapplied).toEqual([])
    expect(payload.intent).toEqual({ goal, requiredOutcomes: ['Lists an order'], mustPreserve: [] })
  })

  it('keeps a deployed intent value reported only by its hash out, where a change reaches it', () => {
    const live = check({ intent: { goal: 'now', constraints: [] } })
    const change = remote({ path: '/intent/goal', before: { $hash: 'h1' }, after: 'now' })
    const { payload, hashed } = side(live, deployedCheck({ intent: { goal: { $hash: 'h1' }, requiredOutcomes: [] } }), [change])
    expect(hashed).toEqual([change])
    expect(payload.intent).toEqual(live.intent)
  })

  it.each([
    { from: false, to: true, expected: null },
    { from: true, to: false, expected: SINGLE_RETRY_ELSEWHERE },
  ])('takes the deployed strategy when the legacy retry flag alone moved from $from to $to', ({ from, to, expected }) => {
    // The import format spells a null strategy beside the flag as its single retry.
    const live = check({ doubleCheck: to, retryStrategy: to ? { ...SINGLE_RETRY_ELSEWHERE } : null })
    const { payload, unapplied } = side(live, deployedCheck({ doubleCheck: from, retryStrategy: null }), [
      remote({ path: '/doubleCheck', before: from, after: to }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.doubleCheck).toBe(from)
    expect(payload.retryStrategy).toEqual(expected)
  })

  it('masks every masked position of a list, a variable locked since the deploy included', () => {
    const live = check({
      environmentVariables: [
        { key: 'API_KEY', value: MASK, locked: true, secret: false },
        { key: 'LATER', value: MASK, locked: true, secret: false },
      ],
    })
    // The deployed value holds the variable's text, unlocked at the time; the change masks it.
    const deployed = deployedCheck({
      environmentVariables: [
        { key: 'API_KEY', value: SAME, locked: true, secret: false },
        { key: 'LATER', value: 'plain-at-deploy', locked: false, secret: false },
      ],
    })
    const { payload } = side(live, deployed, [remote({
      path: '/environmentVariables',
      secret: true,
      before: [{ key: 'API_KEY', value: SAME, locked: true, secret: false }, { key: 'LATER', value: { $masked: 'changed' }, locked: false, secret: false }],
      after: [{ key: 'API_KEY', value: SAME, locked: true, secret: false }, { key: 'LATER', value: { $masked: 'changed' }, locked: true, secret: false }],
    })])
    expect(payload.environmentVariables).toEqual([
      { key: 'API_KEY', value: MASK, locked: true, secret: false },
      { key: 'LATER', value: MASK, locked: false, secret: false },
    ])
  })

  it('masks a locked header list as the change reports it', () => {
    const live = check()
    ;(live.request as Record<string, unknown>).headers = [
      { key: 'X-Key', value: '', locked: true },
      { key: 'X-Added', value: '', locked: true },
    ]
    const { payload } = side(live, deployedCheck(), [remote({
      path: '/request/headers',
      secret: true,
      before: [{ key: 'X-Key', value: SAME, locked: true }],
      after: [{ key: 'X-Key', value: SAME, locked: true }, { key: 'X-Added', value: SAME, locked: true }],
    })])
    expect((payload.request as Record<string, unknown>).headers).toEqual([{ key: 'X-Key', value: MASK, locked: true }])
  })

  it('spells a deployed null strategy beside the legacy retry flag as the flag\'s single retry', () => {
    const live = check({ doubleCheck: false, retryStrategy: { type: 'FIXED', maxRetries: 2 } })
    const { payload } = side(live, deployedCheck({ doubleCheck: true, retryStrategy: null }), [
      remote({ path: '/doubleCheck', before: true, after: false }),
      remote({ path: '/retryStrategy', before: null }),
      remote({ path: '/retryStrategy/type', after: 'FIXED' }),
      remote({ path: '/retryStrategy/maxRetries', after: 2 }),
    ])
    expect(payload.doubleCheck).toBe(true)
    expect(payload.retryStrategy).toEqual(SINGLE_RETRY_ELSEWHERE)
  })

  it('restores a retry strategy removed in Checkly from the deployed value, the container change first', () => {
    // Stored as null beside the legacy flag, which the import format spells as its single retry.
    const live = check({ doubleCheck: true, retryStrategy: { ...SINGLE_RETRY_ELSEWHERE } })
    const strategy = { type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true }
    const { payload, unapplied } = side(live, deployedCheck({ retryStrategy: strategy }), [
      remote({ path: '/doubleCheck', before: false, after: true }),
      remote({ path: '/retryStrategy', after: null }),
      remote({ path: '/retryStrategy/type', before: 'FIXED' }),
      remote({ path: '/retryStrategy/baseBackoffSeconds', before: 60 }),
      remote({ path: '/retryStrategy/maxRetries', before: 2 }),
      remote({ path: '/retryStrategy/maxDurationSeconds', before: 600 }),
      remote({ path: '/retryStrategy/sameRegion', before: true }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.doubleCheck).toBe(false)
    expect(payload.retryStrategy).toEqual(strategy)
  })

  it('restores credentials set to null in Checkly, the password masked', () => {
    const live = check()
    ;(live.request as Record<string, unknown>).basicAuth = null
    const deployed = deployedCheck()
    ;(deployed.request as Record<string, unknown>).basicAuth = { username: 'svc', password: SAME }
    const { payload, unapplied } = side(live, deployed, [
      remote({ path: '/request/basicAuth', after: null }),
      remote({ path: '/request/basicAuth/username', before: 'svc' }),
      remote({ path: '/request/basicAuth/password', before: SAME, secret: true }),
    ])
    expect(unapplied).toEqual([])
    expect((payload.request as Record<string, unknown>).basicAuth).toEqual({ username: 'svc', password: MASK })
  })

  it.each([[[]], [null]])('restores a set emptied to %j in Checkly from the deployed elements', emptied => {
    const { payload, unapplied } = side(check({ tags: emptied }), deployedCheck({ tags: ['api', 'web'] }), [
      remote({ path: '/tags', after: emptied }),
      remote({ path: '/tags/a1b2c3', before: 'api' }),
      remote({ path: '/tags/d4e5f6', before: 'web' }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.tags).toEqual(['api', 'web'])
  })

  it('restores a set emptied to null in Checkly, its element named by a digest of digits alone', () => {
    const { payload, unapplied } = side(check({ tags: null }), deployedCheck({ tags: ['api'] }), [
      remote({ path: '/tags', after: null }),
      remote({ path: '/tags/583920', before: 'api' }),
    ])
    expect(unapplied).toEqual([])
    expect(payload.tags).toEqual(['api'])
  })

  it('leaves out a list the deploy did not leave, whose elements were added since', () => {
    const { payload, unapplied } = side(
      check({ playwrightConfig: { use: { baseURL: 'u' }, projects: [{ name: 'chromium' }] } }),
      deployedCheck({ playwrightConfig: { use: { baseURL: 'u' } } }),
      [remote({ path: '/playwrightConfig/projects/0/name', after: 'chromium' })],
    )
    expect(unapplied).toEqual([])
    expect(payload.playwrightConfig).toEqual({ use: { baseURL: 'u' } })
  })

  it('keeps the current strategy when the legacy flag moved and the deployed resource has no strategy', () => {
    const live = { id: 41, name: 'Backend', doubleCheck: true, retryStrategy: { ...SINGLE_RETRY_ELSEWHERE } }
    const { payload } = deployedSide('check-group', { name: 'Backend', doubleCheck: false }, live, [
      remote({ path: '/doubleCheck', before: false, after: true }),
    ], ids)
    expect(payload.doubleCheck).toBe(false)
    expect(payload.retryStrategy).toEqual(SINGLE_RETRY_ELSEWHERE)
  })

  it('refuses a path or value that names a prototype, leaving Object.prototype alone', () => {
    const changes = [
      remote({ path: '/__proto__/polluted', before: 'yes' }),
      remote({ path: '/constructor/prototype/polluted', before: 'yes' }),
      remote({ path: '/request/__proto__', before: { polluted: 'yes' }, after: {} }),
      remote({ path: '/name', before: JSON.parse('{"__proto__": {"polluted": "yes"}}'), after: 'Orders API' }),
    ]
    const deployed = { ...deployedCheck(), ...JSON.parse('{"__proto__": {"polluted": "yes"}}') }
    const { payload, unapplied } = side(check(), deployed, changes)
    expect(new Set(unapplied)).toEqual(new Set(changes))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(payload.name).toBe('Orders API')
  })

  it('notes a change under a value that holds no properties', () => {
    const change = remote({ path: '/name/first', before: 'Old' })
    const { payload, unapplied } = side(check(), deployedCheck(), [change])
    expect(unapplied).toEqual([change])
    expect(payload.name).toBe('Orders API')
  })

  it('leaves both inputs as they were', () => {
    const live = check()
    const deployed = deployedCheck({ tags: ['api'], groupId: { ref: 'grp-a' } })
    const before = JSON.stringify([live, deployed])
    side(live, deployed, [
      remote({ path: '/tags/a1b2c3', after: 'web' }),
      remote({ path: '/groupId', before: { $ref: 'grp-a' }, after: null }),
      remote({ path: '/request/basicAuth/username', before: 'deployer', after: '' }),
    ])
    expect(JSON.stringify([live, deployed])).toBe(before)
  })
})

describe('spelledOutFromDifference', () => {
  it('spells each differing property with its ancestors, a property at its default included', () => {
    const spelled = spelledOutFromDifference(
      'check',
      { muted: true, request: { followRedirects: false, skipSSL: true, url: 'u' } },
      { muted: false, request: { followRedirects: true, skipSSL: false, url: 'u' } },
    )
    expect([...spelled].sort()).toEqual(['muted', 'request', 'request.followRedirects', 'request.skipSSL'])
  })

  it('spells every property under an object present on one side only', () => {
    const spelled = spelledOutFromDifference(
      'check',
      { retryStrategy: { type: 'FIXED', maxRetries: 2 } },
      { retryStrategy: null },
    )
    expect(spelled).toEqual(new Set(['retryStrategy', 'retryStrategy.type', 'retryStrategy.maxRetries']))
  })

  it('matches a key-value list by key and spells the flags that differ', () => {
    const spelled = spelledOutFromDifference(
      'check',
      {
        environmentVariables: [
          { key: 'FLIPPED', value: MASK, locked: false, secret: false },
          { key: 'SAME', value: 'a' },
          { key: 'GONE', value: 'b', locked: false, secret: false },
          { key: 'GONE_LOCKED', value: MASK, locked: true, secret: false },
        ],
      },
      {
        environmentVariables: [
          { key: 'SAME', value: 'changed', locked: false, secret: false },
          { key: 'FLIPPED', value: MASK, locked: true, secret: false },
        ],
      },
    )
    expect([...spelled].sort()).toEqual([
      'environmentVariables',
      'environmentVariables[FLIPPED]',
      'environmentVariables[FLIPPED].locked',
      'environmentVariables[GONE_LOCKED]',
      'environmentVariables[GONE_LOCKED].locked',
    ])
  })

  it('spells a flag of an element on one side only when it is set', () => {
    const spelled = spelledOutFromDifference(
      'alert-channel',
      { config: { headers: [] } },
      {
        config: {
          headers: [
            { key: 'X-Plain', value: 'a', locked: false },
            { key: 'X-Locked', value: MASK, locked: true },
          ],
        },
      },
    )
    expect(spelled).not.toContain('headers[X-Plain].locked')
    expect(spelled).toContain('headers[X-Locked].locked')
  })

  it('keeps a dotted key inside its brackets', () => {
    const spelled = spelledOutFromDifference(
      'check',
      { request: { headers: [{ key: 'x.trace', value: 'a', locked: true }] } },
      { request: { headers: [{ key: 'x.trace', value: 'a', locked: false }] } },
    )
    expect(spelled).toContain('request.headers[x.trace]')
    expect(spelled).toContain('request.headers[x.trace].locked')
  })

  it('spells nothing for equal payloads', () => {
    expect(spelledOutFromDifference('check', check(), check())).toEqual(new Set())
  })

  // Every literal path a codegen consults through `spelledOut()`, with a
  // pair of import-format payloads that differ there.
  const LITERALS: Record<string, { type: string, deployed: unknown, live: unknown }> = {
    'activated': { type: 'check', deployed: { activated: false }, live: { activated: true } },
    'muted': { type: 'check', deployed: { muted: true }, live: { muted: false } },
    'shouldFail': { type: 'check', deployed: { shouldFail: true }, live: { shouldFail: false } },
    'locations': { type: 'check', deployed: { locations: ['eu-west-1'] }, live: { locations: [] } },
    'tags': { type: 'check', deployed: { tags: ['a'] }, live: { tags: [] } },
    'testOnly': { type: 'check', deployed: { testOnly: true }, live: { testOnly: false } },
    'runParallel': { type: 'check', deployed: { runParallel: true }, live: { runParallel: false } },
    'testCommand': { type: 'check', deployed: { testCommand: 'npx playwright test --a' }, live: { testCommand: 'npx playwright test' } },
    'request.ipFamily': { type: 'check', deployed: { request: { ipFamily: 'IPv6' } }, live: { request: { ipFamily: 'IPv4' } } },
    'request.followRedirects': { type: 'check', deployed: { request: { followRedirects: false } }, live: { request: { followRedirects: true } } },
    'request.skipSSL': { type: 'check', deployed: { request: { skipSSL: true } }, live: { request: { skipSSL: false } } },
    'request.body': { type: 'check', deployed: { request: { body: '{}' } }, live: { request: { body: '' } } },
    'request.bodyType': { type: 'check', deployed: { request: { bodyType: 'JSON' } }, live: { request: { bodyType: 'NONE' } } },
    'request.basicAuth': {
      type: 'check',
      deployed: { request: { basicAuth: { username: 'u', password: '' } } },
      live: { request: { basicAuth: { username: '', password: '' } } },
    },
    'request.protocol': { type: 'check', deployed: { request: { protocol: 'TCP' } }, live: { request: { protocol: 'UDP' } } },
    'request.port': { type: 'check', deployed: { request: { port: 8443 } }, live: { request: { port: 443 } } },
    'request.sslConfig.skipChainValidation': {
      type: 'check',
      deployed: { request: { sslConfig: { skipChainValidation: true } } },
      live: { request: { sslConfig: { skipChainValidation: false } } },
    },
    'apiCheckDefaults.basicAuth': {
      type: 'check-group',
      deployed: { apiCheckDefaults: { basicAuth: { username: 'u', password: '' } } },
      live: { apiCheckDefaults: { basicAuth: { username: '', password: '' } } },
    },
    'sendRecovery': { type: 'alert-channel', deployed: { sendRecovery: false }, live: { sendRecovery: true } },
    'sendFailure': { type: 'alert-channel', deployed: { sendFailure: false }, live: { sendFailure: true } },
    'sendDegraded': { type: 'alert-channel', deployed: { sendDegraded: true }, live: { sendDegraded: false } },
    'sslExpiry': { type: 'alert-channel', deployed: { sslExpiry: true }, live: { sslExpiry: false } },
    'sslExpiryThreshold': { type: 'alert-channel', deployed: { sslExpiryThreshold: 14 }, live: { sslExpiryThreshold: 30 } },
    'payload': { type: 'alert-channel', deployed: { config: { template: 'custom' } }, live: { config: { template: 'default' } } },
    'allowIndexing': { type: 'status-page', deployed: { allowIndexing: false }, live: { allowIndexing: true } },
    'type': { type: 'status-page-component', deployed: { type: 'GROUP' }, live: { type: 'SERVICE' } },
    'hidden': { type: 'status-page-component', deployed: { hidden: true }, live: { hidden: false } },
    'enabled': { type: 'status-page-automation-rule', deployed: { enabled: false }, live: { enabled: true } },
    'notifySubscribers': { type: 'status-page-automation-rule', deployed: { notifySubscribers: false }, live: { notifySubscribers: true } },
  }

  it.each(Object.entries(LITERALS))('spells out %s where the payloads differ there', (literal, { type, deployed, live }) => {
    expect(spelledOutFromDifference(type, deployed, live)).toContain(literal)
  })

  it('spells a status page component\'s configuration key as the construct property it is', () => {
    const spelled = spelledOutFromDifference(
      'status-page-component',
      { configuration: { showHistoricalData: false } },
      { configuration: { showHistoricalData: true } },
    )
    expect(spelled).toContain('showHistoricalData')
  })

  it('spells an alert channel\'s config keys and key-value flags as the construct properties they are', () => {
    const spelled = spelledOutFromDifference(
      'alert-channel',
      { config: { headers: [{ key: 'X', value: 'a', locked: true }] } },
      { config: { headers: [{ key: 'X', value: 'a', locked: false }] } },
    )
    expect(spelled).toContain('headers[X].locked')
  })

  // The `spelledOut()` and `spelledOutUnder()` calls whose argument is not a
  // construct path in the table above: a computed path, the flag of a
  // helper that builds the path itself, or a prefix whose children are the
  // dotted leaves the derivation spells anyway. Each was checked against
  // the derivation; a new call site must be added to the table or here.
  const REVIEWED_CALLS = new Set([
    'check-codegen.ts: spelledOut(prop)',
    'check-codegen.ts: spelledOutUnder(\'retryStrategy\')',
    'check-group-codegen.ts: spelledOutUnder(\'retryStrategy\')',
    'key-value-pair-codegen.ts: spelledOut(`${path}[${kv.key}].${flag}`)',
    'key-value-pair-codegen.ts: spelledOut(\'locked\')',
    'key-value-pair-codegen.ts: spelledOut(\'secret\')',
    'status-page-v3-component-codegen.ts: spelledOut(entry[0])',
  ])

  it('covers every call site in the codegens', () => {
    const constructs = fileURLToPath(new URL('../../../constructs/', import.meta.url))
    const calls: string[] = []
    const files = readdirSync(constructs, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.ts') && !file.includes('__tests__') && file !== path.join('internal', 'codegen', 'context.ts'))
    for (const file of files) {
      const source = readFileSync(path.join(constructs, file), 'utf8')
      for (const match of source.matchAll(/\bspelledOut(?:Under)?\((?:[^()]|\([^()]*\))*\)/g)) {
        calls.push(`${path.basename(file)}: ${match[0]}`)
      }
    }
    expect(calls.length).toBeGreaterThan(REVIEWED_CALLS.size)
    const unknown = calls.filter(call => {
      const literal = /: spelledOut\('([^']*)'\)$/.exec(call)
      return !REVIEWED_CALLS.has(call) && (literal === null || !(literal[1] in LITERALS))
    })
    expect(unknown).toEqual([])
    expect([...REVIEWED_CALLS].filter(call => !calls.includes(call))).toEqual([])
  })
})
