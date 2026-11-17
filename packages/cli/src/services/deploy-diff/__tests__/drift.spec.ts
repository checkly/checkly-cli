import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { DiffChange } from '../../../rest/projects.js'
import { rebuildDeployed, spelledOutFromDifference } from '../drift.js'
import { idKey, MASK } from '../import-shape.js'

/**
 * The parts of a drift diff (`drift.ts`) that the rendered output does not
 * pin down on its own: how the deployed state is rebuilt from the current
 * one, and which construct properties are spelled out on both sides.
 */

const remote = (change: Omit<DiffChange, 'origin'>): DiffChange => ({ origin: 'remote', ...change })

const ids = new Map<string, string | number>([
  [idKey('check-group', 'grp-a'), 41],
])

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
    ...overrides,
  }
}

describe('rebuildDeployed', () => {
  it('rebuilds an object removed in Checkly from its leaves, the parent change standing for the container', () => {
    // A stored strategy cleared with the legacy flag set: the import format
    // spells it as the flag's single retry, the stored row as null.
    const live = check({ doubleCheck: true, retryStrategy: { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false } })
    const { payload, unapplied } = rebuildDeployed('check', live, [
      remote({ path: '/retryStrategy', after: null }),
      remote({ path: '/retryStrategy/type', before: 'FIXED' }),
      remote({ path: '/retryStrategy/maxRetries', before: 2 }),
    ], ids)
    expect(unapplied).toEqual([])
    expect(payload.retryStrategy).toEqual({ type: 'FIXED', maxRetries: 2 })

    const nulled = rebuildDeployed('check', check({ retryStrategy: null }), [
      remote({ path: '/retryStrategy', after: null }),
      remote({ path: '/retryStrategy/type', before: 'FIXED' }),
    ], ids)
    expect(nulled.unapplied).toEqual([])
    expect(nulled.payload.retryStrategy).toEqual({ type: 'FIXED' })
  })

  it('applies a parent change whose deployed value is a leaf, which accounts for the leaves under it', () => {
    const { payload, unapplied } = rebuildDeployed('check', check({ retryStrategy: { type: 'FIXED', maxRetries: 2 } }), [
      remote({ path: '/retryStrategy', before: null }),
      remote({ path: '/retryStrategy/type', after: 'FIXED' }),
      remote({ path: '/retryStrategy/maxRetries', after: 2 }),
    ], ids)
    expect(unapplied).toEqual([])
    expect(payload.retryStrategy).toBeNull()
  })

  it('rebuilds a strategy stored as the flag\'s single retry in full, rather than in part on the stored view', () => {
    const single = { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false }
    const { payload, unapplied } = rebuildDeployed('check', check({ doubleCheck: true, retryStrategy: single }), [
      remote({ path: '/retryStrategy/type', before: 'FIXED', after: 'SINGLE_RETRY' }),
      remote({ path: '/retryStrategy/maxRetries', before: 2 }),
      remote({ path: '/retryStrategy/baseBackoffSeconds', before: 60, after: 0 }),
    ], ids)
    expect(unapplied).toEqual([])
    expect(payload.retryStrategy).toEqual({ type: 'FIXED', baseBackoffSeconds: 60, sameRegion: false, maxRetries: 2 })
  })

  it('creates no parent when a change under it cannot be applied, rather than writing part of it', () => {
    const odd = remote({ path: '/retryStrategy/type', before: 'FIXED', after: 'LINEAR' })
    const leaf = remote({ path: '/retryStrategy/maxRetries', before: 2 })
    const { payload, unapplied } = rebuildDeployed('check', check({ retryStrategy: null }), [
      remote({ path: '/retryStrategy', after: null }),
      odd,
      leaf,
    ], ids)
    expect(unapplied).toEqual([odd, leaf])
    expect(payload.retryStrategy).toBeNull()
  })

  it('refuses a path or value that names a prototype, leaving Object.prototype alone', () => {
    const changes = [
      remote({ path: '/__proto__/polluted', before: 'yes' }),
      remote({ path: '/constructor/prototype/polluted', before: 'yes' }),
      remote({ path: '/request/__proto__', before: { polluted: 'yes' }, after: {} }),
      remote({ path: '/name', before: JSON.parse('{"__proto__": {"polluted": "yes"}}'), after: 'Orders API' }),
      remote({ path: '/tags/__proto__', before: 'yes' }),
    ]
    const { payload, unapplied } = rebuildDeployed('check', check(), changes, ids)
    expect(new Set(unapplied)).toEqual(new Set(changes))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
    expect(payload.name).toBe('Orders API')
  })

  it('applies an element of a set of scalars by value, and leaves one it cannot find unapplied', () => {
    const missing = remote({ path: '/tags/c3', after: 'not-there' })
    const { payload, unapplied } = rebuildDeployed('check', check(), [
      remote({ path: '/tags/a1', after: 'web' }),
      remote({ path: '/tags/b2', before: 'mobile' }),
      missing,
    ], ids)
    expect(payload.tags).toEqual(['api', 'mobile'])
    expect(unapplied).toEqual([missing])
  })

  it('leaves a change in a set of objects, or under one of its elements, unapplied', () => {
    const live = check()
    const element = remote({ path: '/request/assertions/d4', before: { source: 'TEXT_BODY' } })
    const under = remote({ path: '/request/assertions/d4/target', before: '201', after: '200' })
    const { payload, unapplied } = rebuildDeployed('check', live, [element, under], ids)
    expect(unapplied).toEqual([element, under])
    expect(payload.request).toEqual(live.request)
  })

  it('decides what it cannot apply against the current payload, before writing anything', () => {
    const live = check({ components: [{ componentId: 'component-uuid' }] })
    const whole = remote({ path: '/components', before: ['a'], after: [{ componentId: 'component-uuid' }] })
    const element = remote({ path: '/components/e5', before: 'b' })
    const { payload, unapplied } = rebuildDeployed('check', live, [element, whole], ids)
    expect(payload.components).toEqual(['a'])
    expect(unapplied).toEqual([element])
  })

  it('leaves a change to the deploy-only private location list unapplied', () => {
    const change = remote({ path: '/privateLocations/f6', before: { $ref: 'office' } })
    expect(rebuildDeployed('check', check(), [change], ids).unapplied).toEqual([change])
  })

  it('places a reference by physical id as the import format holds it', () => {
    const { payload } = rebuildDeployed('check', check({ groupId: 42 }), [
      remote({ path: '/groupId', before: { $id: '41' }, after: { $id: '42' } }),
    ], ids)
    expect(payload.groupId).toBe(41)
    const component = rebuildDeployed('status-page-component', { id: 'c', parentId: 'p-now' }, [
      remote({ path: '/parentId', before: { $id: 'p-then' }, after: { $id: 'p-now' } }),
    ], ids)
    expect(component.payload.parentId).toBe('p-then')
  })

  it('resolves a reference by logical id, and leaves an unknown one unapplied', () => {
    const unknown = remote({ path: '/groupId', before: { $ref: 'grp-unknown' }, after: null })
    const known = rebuildDeployed('check', check(), [
      remote({ path: '/groupId', before: { $ref: 'grp-a' }, after: null }),
    ], ids)
    expect(known.payload.groupId).toBe(41)
    const failed = rebuildDeployed('check', check(), [unknown], ids)
    expect(failed.unapplied).toEqual([unknown])
    expect(failed.payload.groupId).toBeNull()
  })

  it('creates a parent only under a reported container, never from a null or absent node alone', () => {
    const { payload, unapplied } = rebuildDeployed('check', check({ retryStrategy: null }), [
      remote({ path: '/retryStrategy', after: null }),
      remote({ path: '/retryStrategy/type', before: 'FIXED' }),
      remote({ path: '/retryStrategy/maxRetries', before: 2 }),
    ], ids)
    expect(unapplied).toEqual([])
    expect(payload.retryStrategy).toEqual({ type: 'FIXED', maxRetries: 2 })

    const leaves = [
      remote({ path: '/retryStrategy/type', before: 'FIXED' }),
      remote({ path: '/retryStrategy/maxRetries', before: 2 }),
    ]
    const bare = rebuildDeployed('check', check({ retryStrategy: null }), leaves, ids)
    expect(bare.unapplied).toEqual(leaves)
    expect(bare.payload.retryStrategy).toBeNull()

    const live = check()
    delete live.retryStrategy
    const absent = remote({ path: '/retryStrategy/type', before: 'FIXED' })
    const result = rebuildDeployed('check', live, [absent], ids)
    expect(result.unapplied).toEqual([absent])
    expect(result.payload).not.toHaveProperty('retryStrategy')
  })

  it('never turns a set element\'s digest under a null list into a property', () => {
    const tag = remote({ path: '/tags/9a8b', before: 'prod' })
    const header = remote({ path: '/request/headers/7c6d', before: { key: 'X-Trace', value: '1', locked: false } })
    const live = check({ tags: null })
    ;(live.request as Record<string, unknown>).headers = null
    const { payload, unapplied } = rebuildDeployed('check', live, [header, tag], ids)
    expect(unapplied).toEqual([tag, header])
    expect(payload.tags).toBeNull()
    expect((payload.request as Record<string, unknown>).headers).toBeNull()
  })

  it('leaves a path the current payload does not hold unapplied, rather than inventing it', () => {
    const nested = remote({ path: '/request/notInTheImportFormat/value', before: 1, after: 2 })
    const leaf = remote({ path: '/notInTheImportFormat', before: 1, after: 2 })
    const { payload, unapplied } = rebuildDeployed('check', check(), [nested, leaf], ids)
    expect(unapplied).toEqual([leaf, nested])
    expect(payload).not.toHaveProperty('notInTheImportFormat')
  })

  it('restores a property removed since the deploy, and removes one added since', () => {
    const live = check({ description: 'added in Checkly' })
    delete (live.request as Record<string, unknown>).followRedirects
    const { payload, unapplied } = rebuildDeployed('check', live, [
      remote({ path: '/description', after: 'added in Checkly' }),
      remote({ path: '/request/followRedirects', before: false }),
    ], ids)
    expect(unapplied).toEqual([])
    expect(payload).not.toHaveProperty('description')
    expect((payload.request as Record<string, unknown>).followRedirects).toBe(false)
  })

  it('writes the mask for every masked position, never null', () => {
    const { payload } = rebuildDeployed('check', check(), [remote({
      path: '/environmentVariables',
      secret: true,
      before: [{ key: 'API_KEY', value: { $masked: 'same' }, locked: true, secret: false }, { key: 'OLD', value: { $masked: 'changed' }, locked: true, secret: false }],
      after: [{ key: 'API_KEY', value: { $masked: 'same' }, locked: true, secret: false }],
    })], ids)
    expect(payload.environmentVariables).toEqual([
      { key: 'API_KEY', value: MASK, locked: true, secret: false },
      { key: 'OLD', value: MASK, locked: true, secret: false },
    ])
  })

  it('keeps the current value for a hashed one, and leaves a hash inside a compound value unapplied', () => {
    const live = check({ script: 'now' })
    const scalar = remote({ path: '/script', before: { $hash: 'a' }, after: { $hash: 'b' } })
    const compound = remote({ path: '/request/basicAuth', before: { username: { $hash: 'c' }, password: '' }, after: { username: '', password: '' } })
    const cause = remote({ path: '/codeBundle', cause: 'code bundle' })
    const { payload, hashed, unapplied } = rebuildDeployed('check', live, [scalar, compound, cause], ids)
    expect(payload.script).toBe('now')
    expect((payload.request as Record<string, unknown>).basicAuth).toEqual({ username: '', password: '' })
    expect(hashed).toEqual([scalar])
    expect(unapplied).toEqual([compound])
  })

  it('spells a strategy the legacy retry flag implies as the import format does', () => {
    const single = { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false }
    const { payload } = rebuildDeployed('check', check({ doubleCheck: true, retryStrategy: single }), [
      remote({ path: '/name', before: 'Old', after: 'Orders API' }),
    ], ids)
    expect(payload.retryStrategy).toEqual(single)
  })

  it('leaves the current payload as it was', () => {
    const live = check()
    const snapshot = JSON.stringify(live)
    rebuildDeployed('check', live, [
      remote({ path: '/tags/a1', after: 'web' }),
      remote({ path: '/request/basicAuth/username', before: 'deployer', after: '' }),
    ], ids)
    expect(JSON.stringify(live)).toBe(snapshot)
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
