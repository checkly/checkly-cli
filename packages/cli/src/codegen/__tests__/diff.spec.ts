import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  generateConstructDiff,
  generateConstructFiles,
  type GenerateDiffChange,
  type GenerateDiffInput,
  type GenerateDiffLine,
  type GenerateDiffOptions,
  type GenerateDiffRedaction,
} from '../index.js'

/**
 * `generateConstructDiff`: a resource's drift as a construct diff, the
 * construct its last deploy left (`-`) against the construct Checkly has now
 * (`+`). The fixtures are the import format, as the resource is stored now,
 * and the deployed resource and changes in a deploy plan's vocabulary.
 */

const CHANGED = { $masked: 'changed' }
const SAME = { $masked: 'same' }

const CHECK_RULES: GenerateDiffRedaction[] = [
  { path: '/environmentVariables/*/value', kind: 'value', when: 'lockedOrSecret' },
  { path: '/request/headers/*/value', kind: 'value', when: 'lockedOrSecret' },
  { path: '/request/basicAuth/password', kind: 'value' },
]

/** An API check as Checkly has it now, in the import format. */
function apiCheck (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chk-uuid',
    checkType: 'API',
    name: 'Orders API',
    frequency: 10,
    activated: true,
    muted: false,
    shouldFail: false,
    locations: ['eu-west-1', 'us-east-1'],
    tags: ['api'],
    groupId: null,
    runtimeId: '2025.04',
    retryStrategy: null,
    doubleCheck: false,
    runParallel: false,
    useGlobalAlertSettings: true,
    environmentVariables: [
      { key: 'REGION', value: 'eu', locked: false, secret: false },
    ],
    request: {
      method: 'GET',
      url: 'https://api.example.com/orders',
      body: '',
      bodyType: 'NONE',
      headers: [],
      queryParameters: [],
      assertions: [],
      basicAuth: { username: '', password: '' },
      followRedirects: true,
      skipSSL: false,
      ipFamily: 'IPv4',
    },
    alertChannelSubscriptions: [],
    privateLocationAssignments: [],
    ...overrides,
  }
}

/**
 * The drift of an API check. Unless a test passes its own `deployed`, the
 * deployed resource is the current payload: every change in such a test is
 * reported at the path whose value it names, which the change alone decides.
 */
function drift (
  payload: Record<string, unknown>,
  changes: GenerateDiffChange[],
  extra: Partial<GenerateDiffInput> = {},
  options?: GenerateDiffOptions,
): GenerateDiffLine[] {
  return generateConstructDiff({
    resource: { type: 'check', logicalId: 'orders-api', payload },
    deployed: structuredClone(payload),
    changes,
    redactions: CHECK_RULES,
    ...extra,
  }, options)
}

/** The lines with the marker a unified diff gives each one, so the assertions read like the diff. */
function plain (lines: GenerateDiffLine[]): string[] {
  return lines.map(line => {
    switch (line.kind) {
      case 'add': return `+${line.text}`
      case 'remove': return `-${line.text}`
      case 'context': return ` ${line.text}`
      case 'hunk': return '@@'
      case 'nested': return `  ${plain([line.line])[0]}`
      case 'reason': return `reason: ${line.text}`
      default: return `note: ${line.text}`
    }
  })
}

const changedLines = (lines: string[]) => lines.filter(line => /^[-+]/.test(line))

describe('generateConstructDiff', () => {
  it('shows the deployed construct removed and the current one added', () => {
    const lines = plain(drift(apiCheck({ name: 'New', frequency: 10 }), [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/frequency', before: 5, after: 10 },
    ]))
    expect(lines[0]).toBe('@@')
    expect(changedLines(lines)).toEqual([
      '-  name: \'Old\',',
      '+  name: \'New\',',
      '-  frequency: Frequency.EVERY_5M,',
      '+  frequency: Frequency.EVERY_10M,',
    ])
    const text = lines.join('\n')
    expect(text).not.toContain('changed in Checkly')
    expect(text).not.toContain('overwritten')
  })

  it('pairs a value moved to its default with the value it had', () => {
    const lines = plain(drift(apiCheck({ muted: false }), [{ path: '/muted', before: true, after: false }]))
    expect(changedLines(lines)).toEqual(['-  muted: true,', '+  muted: false,'])
  })

  it('pairs a value moved away from its default with the default', () => {
    const payload = apiCheck({ activated: false })
    ;(payload.request as Record<string, unknown>).followRedirects = false
    const lines = plain(drift(payload, [
      { path: '/activated', before: true, after: false },
      { path: '/request/followRedirects', before: true, after: false },
    ]))
    expect(changedLines(lines)).toEqual([
      '-  activated: true,',
      '+  activated: false,',
      '-    followRedirects: true,',
      '+    followRedirects: false,',
    ])
  })

  it('writes an unchanged default without project defaults, leaves it out with defaults that agree', () => {
    const changes = [{ path: '/name', before: 'Old', after: 'Orders API' }]
    // Unknown defaults: every property, as the code generated for the resource reads.
    const bare = plain(drift(apiCheck(), changes, {}, { context: Infinity }))
    expect(bare).toContain('   muted: false,')
    const none = plain(drift(apiCheck(), changes, {}, { context: Infinity, projectDefaults: {} }))
    expect(none.join('\n')).not.toContain('muted')
    const withDefaults = plain(drift(apiCheck(), changes, {}, {
      context: Infinity,
      projectDefaults: { checks: { muted: true } },
    }))
    expect(withDefaults).toContain('   muted: false,')
  })

  it('marks a rotated locked variable on the current side, masked on both, never valued', () => {
    const payload = apiCheck({
      environmentVariables: [
        { key: 'API_KEY', value: 'current-plaintext', locked: true, secret: false },
        { key: 'REGION', value: 'eu', locked: false, secret: false },
      ],
    })
    const lines = plain(drift(payload, [{
      path: '/environmentVariables',
      secret: true,
      before: [{ key: 'API_KEY', value: SAME, locked: true, secret: false }, { key: 'REGION', value: 'eu', locked: false, secret: false }],
      after: [{ key: 'API_KEY', value: CHANGED, locked: true, secret: false }, { key: 'REGION', value: 'eu', locked: false, secret: false }],
    }]))
    expect(changedLines(lines)).toEqual([
      '-      value: \'********\',',
      '+      value: \'******** (changed)\',',
    ])
    const text = lines.join('\n')
    expect(text).not.toContain('current-plaintext')
    expect(text).not.toContain('secret changed')
    expect(text).not.toContain('#')
  })

  it('spells out a variable\'s lock flag when it was flipped, without printing either value', () => {
    const payload = apiCheck({
      environmentVariables: [{ key: 'API_KEY', value: 'current-plaintext', locked: true, secret: false }],
    })
    const lines = plain(drift(payload, [{
      path: '/environmentVariables',
      secret: true,
      before: [{ key: 'API_KEY', value: SAME, locked: false, secret: false }],
      after: [{ key: 'API_KEY', value: SAME, locked: true, secret: false }],
    }]))
    expect(changedLines(lines)).toEqual(['-      locked: false,', '+      locked: true,'])
    expect(lines.join('\n')).not.toContain('current-plaintext')
    expect(lines.at(-1)).toBe('note: secret changed: /environmentVariables')
  })

  it('renders a locked variable whose value the payload holds as null', () => {
    const payload = apiCheck({
      name: 'New',
      environmentVariables: [{ key: 'API_KEY', value: null, locked: true, secret: false }],
    })
    const lines = plain(drift(payload, [{ path: '/name', before: 'Old', after: 'New' }], {}, { context: Infinity }))
    expect(lines.some(line => line.startsWith('reason:'))).toBe(false)
    expect(lines).toContain('       value: \'********\',')
  })

  it('lists the changes when no redaction rule reaches a secret change', () => {
    const lines = plain(drift(apiCheck({ name: 'New' }), [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/environmentVariables', secret: true, before: [{ key: 'API_KEY', value: SAME }], after: [] },
    ], { redactions: [] }))
    expect(lines).toEqual([
      'note: /name: "Old" -> "New"',
      'note: secret changed: /environmentVariables',
    ])
  })

  it('masks a moved scalar secret on both sides and marks it on the current one', () => {
    const payload = apiCheck()
    ;(payload.request as Record<string, unknown>).basicAuth = { username: 'admin', password: 'current-password' }
    const lines = plain(drift(payload, [{
      path: '/request/basicAuth/password',
      secret: true,
      before: CHANGED,
      after: CHANGED,
    }]))
    expect(changedLines(lines)).toEqual([
      '-      password: \'********\',',
      '+      password: \'******** (changed)\',',
    ])
    expect(lines.join('\n')).not.toContain('current-password')
  })

  describe('references', () => {
    const references = [
      { type: 'check-group', logicalId: 'grp-a', physicalId: 41, name: 'Backend' },
      { type: 'check-group', logicalId: 'grp-b', physicalId: 42, name: 'Frontend' },
    ]

    it('renders a changed reference as fromId() on both sides, with the names', () => {
      const lines = plain(drift(apiCheck({ groupId: 42 }), [
        { path: '/groupId', before: { $ref: 'grp-a' }, after: { $ref: 'grp-b' } },
      ], { references }))
      expect(changedLines(lines)).toEqual([
        '-  group: CheckGroupV2.fromId(41), // Backend',
        '+  group: CheckGroupV2.fromId(42), // Frontend',
      ])
    })

    it('notes a reference it cannot resolve and renders the rest', () => {
      const lines = plain(drift(apiCheck({ groupId: 42, name: 'New' }), [
        { path: '/name', before: 'Old', after: 'New' },
        { path: '/groupId', before: { $ref: 'grp-unknown' }, after: { $ref: 'grp-b' } },
      ], { references }))
      expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
      expect(lines.at(-1)).toBe('note: /groupId: {"$ref":"grp-unknown"} -> {"$ref":"grp-b"}')
    })
  })

  it('shows a set\'s deployed elements, those still there in the current order', () => {
    const payload = apiCheck({ tags: ['new-tag', 'api'], locations: ['eu-west-1'] })
    const lines = plain(drift(payload, [
      { path: '/tags/1a2b3c', after: 'new-tag' },
      { path: '/tags/4d5e6f', before: 'old-tag' },
      { path: '/locations/3c4d5e', before: 'us-east-1' },
    ], { deployed: apiCheck({ tags: ['api', 'old-tag'], locations: ['us-east-1', 'eu-west-1'] }) }))
    expect(changedLines(lines)).toEqual([
      '-    \'us-east-1\',',
      '+    \'new-tag\',',
      '-    \'old-tag\',',
    ])
    expect(lines.filter(line => line.startsWith('note:'))).toEqual([])
  })

  it('renders the current alert channel subscriptions on both sides alike', () => {
    const lines = plain(drift(apiCheck({
      name: 'New',
      alertChannelSubscriptions: [{ id: 1, alertChannelId: 7, checkId: 'chk-uuid', activated: true }],
    }), [{ path: '/name', before: 'Old', after: 'New' }], {
      references: [],
    }, { referencedNames: { 'alert-channel': { 7: 'Ops email' } }, context: Infinity }))
    expect(lines).toContain('     AlertChannel.fromId(7), // Ops email')
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
  })

  it('notes a script whose deployed text is reported only by its hash, with no text diff', () => {
    const lines = plain(drift(apiCheck({ localSetupScript: 'console.log("now")' }), [
      { path: '/localSetupScript', before: { $hash: 'aaa' }, after: { $hash: 'bbb' } },
    ]))
    expect(lines).toEqual(['note: /localSetupScript: changed in Checkly (the deployed text is not available)'])
  })

  it('shows the text diff of a script whose deployed text is reported', () => {
    const lines = plain(drift(apiCheck({ localSetupScript: 'console.log("now")\n' }), [
      { path: '/localSetupScript', before: 'console.log("then")\n', after: 'console.log("now")\n' },
    ]))
    expect(lines).toEqual([
      'note: /localSetupScript:',
      '  @@',
      '  -console.log("then")',
      '  +console.log("now")',
    ])
  })

  it('keeps a hashed value inside the construct as it is now, with a note', () => {
    const payload = apiCheck({ name: 'New' })
    ;(payload.request as Record<string, unknown>).body = 'x'.repeat(300)
    const lines = plain(drift(payload, [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/request/body', before: { $hash: 'aaa' }, after: { $hash: 'bbb' } },
    ]))
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /request/body: changed in Checkly (the deployed text is not available)')
  })

  it('leaves a list with a changed hashed value inside as it is now, with a note', () => {
    const payload = apiCheck()
    ;(payload.request as Record<string, unknown>).headers = [{ key: 'X-Trace', value: 'now', locked: false }]
    const lines = plain(drift(payload, [{
      path: '/request/headers',
      before: [{ key: 'X-Trace', value: { $hash: 'aaa' }, locked: false }],
      after: [{ key: 'X-Trace', value: 'now', locked: false }],
    }]))
    expect(lines).toEqual(['note: /request/headers: changed in Checkly (the deployed text is not available)'])
  })

  it('shows a list whose unchanged hashed value is known from the current one', () => {
    const long = `Bearer ${'x'.repeat(300)}`
    const payload = apiCheck()
    ;(payload.request as Record<string, unknown>).headers = [
      { key: 'Authorization', value: long, locked: false },
      { key: 'X-Trace', value: 'off', locked: false },
    ]
    const lines = plain(drift(payload, [{
      path: '/request/headers',
      before: [{ key: 'Authorization', value: { $hash: 'aaa' }, locked: false }, { key: 'X-Trace', value: 'on', locked: false }],
      after: [{ key: 'Authorization', value: { $hash: 'aaa' }, locked: false }, { key: 'X-Trace', value: 'off', locked: false }],
    }]))
    expect(changedLines(lines)).toEqual(['-        value: \'on\',', '+        value: \'off\','])
    expect(lines.filter(line => line.startsWith('note:'))).toEqual([])
  })

  it('says what changed in one line when every change is a cause', () => {
    const lines = plain(drift(apiCheck(), [
      { path: '/codeBundle', cause: 'code bundle' },
      { path: '/dependencies', cause: 'dependencies' },
    ]))
    expect(lines).toEqual(['note: changed: code bundle, dependencies'])
  })

  it('returns nothing without changes, and only notes for a change the construct does not show', () => {
    expect(drift(apiCheck(), [], {}, { context: Infinity })).toEqual([])
    const lines = plain(drift(apiCheck({ useGlobalAlertSettings: false }), [
      { path: '/useGlobalAlertSettings', before: true, after: false },
    ]))
    expect(lines).toEqual(['note: /useGlobalAlertSettings: true -> false'])
  })

  it('shows the whole construct in one hunk with an infinite context', () => {
    const payload = apiCheck({ name: 'New', muted: true })
    // Without credentials: the diff masks an empty password, which code
    // generated on its own leaves out.
    delete (payload.request as Record<string, unknown>).basicAuth
    const lines = plain(drift(payload, [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/muted', before: false, after: true },
    ], {}, { context: Infinity }))
    expect(lines.filter(line => line === '@@')).toHaveLength(1)
    // Every line of the current construct, as the codegen writes it alone.
    const current = lines.filter(line => line.startsWith(' ') || line.startsWith('+')).map(line => line.slice(1))
    const { files } = generateConstructFiles(
      { resources: [{ type: 'check', logicalId: 'orders-api', payload: { ...payload, groupId: undefined } }] },
    )
    const content = files.find(file => file.path.endsWith('.check.ts'))?.content ?? ''
    expect(content).toContain(current.join('\n'))
    expect(current[0]).toBe('new ApiCheck(\'orders-api\', {')
  })

  it('lists the changes when the construct diff is too large', () => {
    const lines = plain(drift(apiCheck({ name: 'New' }), [{ path: '/name', before: 'Old', after: 'New' }], {}, { maxLines: 5 }))
    expect(lines).toEqual([
      'reason: (the construct diff is too large to show)',
      'note: /name: "Old" -> "New"',
    ])
  })

  it('lists the changes, with the reason, for a resource it cannot render', () => {
    const unsupported = generateConstructDiff({
      resource: { type: 'not-a-type', logicalId: 'x', payload: { id: 'x', name: 'New' } },
      deployed: { name: 'Old' },
      changes: [{ path: '/name', before: 'Old', after: 'New' }],
      redactions: [],
    })
    expect(plain(unsupported)[0]).toMatch(/^reason: \(could not render this resource: /)
    expect(plain(unsupported).at(-1)).toBe('note: /name: "Old" -> "New"')

    const malformed = generateConstructDiff({
      resource: { type: 'check', logicalId: 'x', payload: null },
      deployed: {},
      changes: [{ path: '/name', before: 'Old', after: 'New' }],
      redactions: CHECK_RULES,
    })
    expect(plain(malformed)).toEqual([
      'reason: (the resource has no payload to render)',
      'note: /name: "Old" -> "New"',
    ])
  })

  it('lists the changes, with the reason, without the resource as deployed', () => {
    for (const deployed of [undefined, null, 'x', []]) {
      const lines = plain(generateConstructDiff({
        resource: { type: 'check', logicalId: 'orders-api', payload: apiCheck({ name: 'New' }) },
        deployed,
        changes: [{ path: '/name', before: 'Old', after: 'New' }],
        redactions: CHECK_RULES,
      } as unknown as GenerateDiffInput))
      expect(lines).toEqual([
        'reason: (the resource as deployed is not available)',
        'note: /name: "Old" -> "New"',
      ])
    }
  })

  it('notes a set element under a list that is null now, and renders the rest', () => {
    const payload = apiCheck({ name: 'New' })
    ;(payload.request as Record<string, unknown>).headers = null
    const lines = plain(drift(payload, [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/request/headers/9a8b', before: { key: 'X-Trace', value: '1', locked: false } },
    ]))
    expect(lines.some(line => line.startsWith('reason:'))).toBe(false)
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /request/headers/9a8b: {"key":"X-Trace","value":"1","locked":false} -> (absent)')
  })

  it('renders an object removed in Checkly under one that stays, as the backend reports it by its leaves', () => {
    const alertSettings = { escalationType: 'RUN_BASED', runBasedEscalation: { failedRunThreshold: 1 } }
    const deployed = apiCheck({
      useGlobalAlertSettings: false,
      alertSettings: { ...alertSettings, reminders: { amount: 2, interval: 10 } },
    })
    const lines = plain(drift(apiCheck({ useGlobalAlertSettings: false, alertSettings }), [
      { path: '/alertSettings/reminders/amount', before: 2 },
      { path: '/alertSettings/reminders/interval', before: 10 },
    ], { deployed }))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)).toEqual([
      '-  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {',
      '-    amount: 2,',
      '-    interval: 10,',
      '-  }),',
      '+  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1),',
    ])
  })

  it('renders a list removed in Checkly, reported by its elements\' leaves, from the deployed value', () => {
    const intent = (constraints: unknown[]) => ({ goal: 'Orders load', constraints })
    const outcome = { type: 'REQUIRED_OUTCOME', statement: 'Lists an order' }
    const lines = plain(drift(apiCheck({ intent: intent([outcome]) }), [
      { path: '/intent/mustPreserve/0', before: 'Read only' },
      { path: '/intent/mustPreserve/1', before: 'No writes' },
    ], {
      deployed: apiCheck({
        intent: { goal: 'Orders load', requiredOutcomes: ['Lists an order'], mustPreserve: ['Read only', 'No writes'] },
      }),
    }))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)).toEqual([
      '-      {',
      '-        type: \'MUST_PRESERVE\',',
      '-        statement: \'Read only\',',
      '-      },',
      '-      {',
      '-        type: \'MUST_PRESERVE\',',
      '-        statement: \'No writes\',',
      '-      },',
    ])
  })

  it('renders a retry strategy removed in Checkly as the backend reports it, the parent beside its leaves', () => {
    const deployed = apiCheck({
      retryStrategy: { type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true },
    })
    const lines = plain(drift(apiCheck({ retryStrategy: null }), [
      { path: '/retryStrategy', after: null },
      { path: '/retryStrategy/type', before: 'FIXED' },
      { path: '/retryStrategy/baseBackoffSeconds', before: 60 },
      { path: '/retryStrategy/maxRetries', before: 2 },
      { path: '/retryStrategy/maxDurationSeconds', before: 600 },
      { path: '/retryStrategy/sameRegion', before: true },
    ], { deployed }))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)).toEqual([
      '-  retryStrategy: RetryStrategyBuilder.fixedStrategy({',
      '-    baseBackoffSeconds: 60,',
      '-    maxRetries: 2,',
      '-    maxDurationSeconds: 600,',
      '-    sameRegion: true,',
      '-  }),',
      '+  retryStrategy: RetryStrategyBuilder.noRetries(),',
    ])
  })

  it('renders a retry strategy added in Checkly as the backend reports it, the parent beside its leaves', () => {
    const strategy = { type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true }
    const lines = plain(drift(apiCheck({ retryStrategy: strategy }), [
      { path: '/retryStrategy', before: null },
      { path: '/retryStrategy/type', after: 'FIXED' },
      { path: '/retryStrategy/baseBackoffSeconds', after: 60 },
      { path: '/retryStrategy/maxRetries', after: 2 },
      { path: '/retryStrategy/maxDurationSeconds', after: 600 },
      { path: '/retryStrategy/sameRegion', after: true },
    ]))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)).toEqual([
      '-  retryStrategy: RetryStrategyBuilder.noRetries(),',
      '+  retryStrategy: RetryStrategyBuilder.fixedStrategy({',
      '+    baseBackoffSeconds: 60,',
      '+    maxRetries: 2,',
      '+    maxDurationSeconds: 600,',
      '+    sameRegion: true,',
      '+  }),',
    ])
  })

  it('renders the strategy the legacy retry flag implies when the flag alone moved', () => {
    const single = { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false }
    const turnedOn = plain(drift(apiCheck({ doubleCheck: true, retryStrategy: single }), [
      { path: '/doubleCheck', before: false, after: true },
    ], { deployed: apiCheck({ doubleCheck: false, retryStrategy: null }) }))
    expect(changedLines(turnedOn)).toEqual([
      '-  retryStrategy: RetryStrategyBuilder.noRetries(),',
      '+  retryStrategy: RetryStrategyBuilder.singleRetry({',
      '+    baseBackoffSeconds: 0,',
      '+    sameRegion: false,',
      '+  }),',
    ])
    const turnedOff = plain(drift(apiCheck({ doubleCheck: false, retryStrategy: null }), [
      { path: '/doubleCheck', before: true, after: false },
    ], { deployed: apiCheck({ doubleCheck: true, retryStrategy: null }) }))
    expect(changedLines(turnedOff)).toEqual([
      '-  retryStrategy: RetryStrategyBuilder.singleRetry({',
      '-    baseBackoffSeconds: 0,',
      '-    sameRegion: false,',
      '-  }),',
      '+  retryStrategy: RetryStrategyBuilder.noRetries(),',
    ])
  })

  it('renders an edited intent outcome beside a long goal that stayed as it was', () => {
    const goal = `Orders load ${'quickly '.repeat(40)}`
    const lines = plain(drift(apiCheck({
      intent: { goal, constraints: [{ type: 'REQUIRED_OUTCOME', statement: 'Lists every order' }] },
    }), [
      { path: '/intent/requiredOutcomes', before: ['Lists an order'], after: ['Lists every order'] },
    ], { deployed: apiCheck({ intent: { goal: { $hash: 'h1' }, requiredOutcomes: ['Lists an order'], mustPreserve: [] } }) }))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)).toEqual([
      '-        statement: \'Lists an order\',',
      '+        statement: \'Lists every order\',',
    ])
  })

  it('masks a deployed password no change names, in credentials removed in Checkly', () => {
    const payload = apiCheck()
    ;(payload.request as Record<string, unknown>).basicAuth = null
    const deployed = apiCheck()
    ;(deployed.request as Record<string, unknown>).basicAuth = { username: 'svc', password: 'p@ss-plain' }
    const lines = plain(drift(payload, [
      { path: '/request/basicAuth', after: null },
      { path: '/request/basicAuth/username', before: 'svc' },
    ], { deployed }))
    const text = lines.join('\n')
    expect(text).toContain('\'********\'')
    expect(text).not.toContain('p@ss-plain')
  })

  it('renders a strategy stored as the legacy flag\'s single retry against the deployed one', () => {
    const lines = plain(drift(apiCheck({
      doubleCheck: true,
      retryStrategy: { type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: false },
    }), [
      { path: '/retryStrategy/type', before: 'FIXED', after: 'SINGLE_RETRY' },
      { path: '/retryStrategy/maxRetries', before: 2 },
      { path: '/retryStrategy/baseBackoffSeconds', before: 60, after: 0 },
    ]))
    expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
    expect(changedLines(lines)[0]).toBe('-  retryStrategy: RetryStrategyBuilder.fixedStrategy({')
    expect(changedLines(lines)).toContain('+  retryStrategy: RetryStrategyBuilder.singleRetry({')
  })

  it('notes a change whose path names a prototype, and leaves Object.prototype alone', () => {
    const lines = plain(drift(apiCheck({ name: 'New' }), [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/__proto__/polluted', before: 'yes' },
    ]))
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /__proto__/polluted: "yes" -> (absent)')
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('takes malformed references, redactions and values without throwing', () => {
    const input = {
      resource: { type: 'check', logicalId: 'orders-api', payload: apiCheck({ name: 'New' }) },
      deployed: apiCheck(),
      changes: [
        { path: '/name', before: 'Old', after: 'New' },
        // No JSON spells a bigint, so its note names the path alone.
        { path: '/description', before: 10n, after: 20n },
      ],
      redactions: [null, 'x', ...CHECK_RULES],
      references: [null, 'x', { type: 'check-group', logicalId: 'grp', physicalId: 41 }],
    } as unknown as GenerateDiffInput
    const lines = plain(generateConstructDiff(input))
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /description: changed')

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const unlistable = generateConstructDiff({
      resource: { type: 'check', logicalId: 'orders-api', payload: apiCheck() },
      deployed: apiCheck(),
      changes: [{ path: '/name', before: cyclic, after: 'Orders API' }],
      redactions: CHECK_RULES,
    })
    expect(plain(unlistable)[0]).toMatch(/^reason: /)
    expect(plain(unlistable).at(-1)).toBe('note: /name: changed')
  })

  describe('a header added in Checkly', () => {
    const webhook = (headers: unknown[]) => ({
      id: 7,
      type: 'WEBHOOK',
      config: {
        name: 'Ops hook',
        webhookType: 'WEBHOOK_GENERIC',
        url: 'https://hooks.example.com/ops',
        method: 'POST',
        headers,
        queryParameters: [],
      },
      sendRecovery: true,
      sendFailure: true,
      sendDegraded: false,
      sslExpiry: false,
      sslExpiryThreshold: 30,
    })
    const added = (header: Record<string, unknown>) => plain(generateConstructDiff({
      resource: { type: 'alert-channel', logicalId: 'ops-hook', payload: webhook([header]) },
      deployed: webhook([]),
      changes: [{ path: '/config/headers', before: [], after: [header] }],
      redactions: [{ path: '/config/headers/*/value', kind: 'value', when: 'locked' }],
    }))

    it('prints no lock flag that is not set', () => {
      const lines = added({ key: 'X-Plain', value: 'a', locked: false })
      expect(lines.some(line => line.startsWith('reason:'))).toBe(false)
      expect(changedLines(lines).join('\n')).toContain('X-Plain')
      expect(changedLines(lines).join('\n')).not.toContain('locked')
    })

    it('prints a lock flag that is set', () => {
      const lines = added({ key: 'X-Locked', value: 'secret-value', locked: true })
      expect(changedLines(lines).join('\n')).toContain('locked: true')
      expect(lines.join('\n')).not.toContain('secret-value')
    })
  })

  it('notes a set whose deployed elements refer to a resource it cannot resolve, and renders the rest', () => {
    const lines = plain(generateConstructDiff({
      deployed: {
        statusPageId: { ref: 'page' },
        name: 'Old',
        components: [{ componentId: { ref: 'old-component' }, targetImpact: 'MAJOR_OUTAGE' }],
      },
      resource: {
        type: 'status-page-automation-rule',
        logicalId: 'outage-rule',
        payload: {
          id: 'rule-uuid',
          statusPageId: 'page-uuid',
          name: 'New',
          enabled: true,
          firstUpdate: 'Investigating',
          lastUpdate: 'Resolved',
          notifySubscribers: true,
          tags: ['api'],
          coolDownWindowMinutes: 10,
          components: [{ componentId: 'component-uuid', targetImpact: 'MAJOR_OUTAGE' }],
        },
      },
      changes: [
        { path: '/name', before: 'Old', after: 'New' },
        { path: '/components/9f8e/componentId', before: { $ref: 'old-component' }, after: { $ref: 'component' } },
      ],
      redactions: [],
    }))
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /components/9f8e/componentId: {"$ref":"old-component"} -> {"$ref":"component"}')
  })

  it('notes a change to the deploy-only private location list', () => {
    const lines = plain(drift(apiCheck({ name: 'New' }), [
      { path: '/name', before: 'Old', after: 'New' },
      { path: '/privateLocations/7a7a', before: { $ref: 'office' } },
    ]))
    expect(changedLines(lines)).toEqual(['-  name: \'Old\',', '+  name: \'New\','])
    expect(lines.at(-1)).toBe('note: /privateLocations/7a7a: {"$ref":"office"} -> (absent)')
  })

  describe('elements of a list reached by index', () => {
    const references = [
      { type: 'status-page-service', logicalId: 'svc-a', physicalId: 'svc-a-uuid', name: 'API' },
      { type: 'status-page-service', logicalId: 'svc-b', physicalId: 'svc-b-uuid', name: 'Web' },
      { type: 'status-page-service', logicalId: 'svc-c', physicalId: 'svc-c-uuid', name: 'Queue' },
    ]

    it('places a card\'s services and a restored card as the import format does', () => {
      const lines = plain(generateConstructDiff({
        resource: {
          type: 'status-page',
          logicalId: 'acme',
          payload: {
            id: 'page-uuid',
            name: 'ACME',
            url: 'acme-status',
            cards: [{ id: 'card-uuid', name: 'Card', services: [{ id: 'svc-a-uuid' }, { id: 'svc-b-uuid' }] }],
          },
        },
        deployed: {
          name: 'ACME',
          url: 'acme-status',
          cards: [
            { name: 'Card', services: [{ ref: 'svc-a' }, { ref: 'svc-x' }, { ref: 'svc-c' }] },
            // A card the deploy left without services; the import format always lists them.
            { name: 'Old card' },
          ],
        },
        changes: [
          { path: '/cards/0/services/1', before: { $id: 'svc-x-uuid' }, after: { $ref: 'svc-b' } },
          { path: '/cards/0/services/2', before: { $ref: 'svc-c' } },
          { path: '/cards/1/name', before: 'Old card' },
        ],
        redactions: [],
        references,
      }, { referencedNames: { 'status-page-service': { 'svc-x-uuid': 'Database' } } }))
      expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([])
      expect(changedLines(lines)).toEqual([
        '-        StatusPageService.fromId(\'svc-x-uuid\'), // Database',
        '-        StatusPageService.fromId(\'svc-c-uuid\'), // Queue',
        '+        StatusPageService.fromId(\'svc-b-uuid\'), // Web',
        '-    },',
        '-    {',
        '-      name: \'Old card\',',
        '-      services: [],',
      ])
    })
  })

  describe('a set whose unchanged deployed elements hold references', () => {
    const rule = (references: GenerateDiffInput['references']) => plain(generateConstructDiff({
      resource: {
        type: 'status-page-automation-rule',
        logicalId: 'outage-rule',
        payload: {
          id: 'rule-uuid',
          statusPageId: 'page-uuid',
          name: 'Outage',
          enabled: true,
          firstUpdate: 'Investigating',
          lastUpdate: 'Resolved',
          notifySubscribers: true,
          tags: ['api'],
          coolDownWindowMinutes: 10,
          components: [
            { componentId: 'comp-a-uuid', targetImpact: 'MAJOR_OUTAGE' },
            { componentId: 'comp-b-uuid', targetImpact: 'DEGRADED_PERFORMANCE' },
          ],
        },
      },
      deployed: {
        statusPageId: { ref: 'page' },
        name: 'Outage',
        components: [{ componentId: { ref: 'comp-a' }, targetImpact: 'MAJOR_OUTAGE' }],
      },
      changes: [{ path: '/components/Xy12Ab', after: { componentId: { $ref: 'comp-b' }, targetImpact: 'DEGRADED_PERFORMANCE' } }],
      redactions: [],
      references,
    }))
    const added = { type: 'status-page-component', logicalId: 'comp-b', physicalId: 'comp-b-uuid', name: 'Web' }

    it('shows the added element when every reference is given', () => {
      const lines = rule([{ type: 'status-page-component', logicalId: 'comp-a', physicalId: 'comp-a-uuid', name: 'API' }, added])
      expect(changedLines(lines)).toEqual([
        '+    {',
        '+      component: StatusPageV3Component.fromId(\'comp-b-uuid\'), // Web',
        '+      targetImpact: \'DEGRADED_PERFORMANCE\',',
        '+    },',
      ])
    })

    it('notes the change when an unchanged element\'s reference is not given', () => {
      expect(rule([added])).toEqual([
        'note: /components/Xy12Ab: (absent) -> {"componentId":{"$ref":"comp-b"},"targetImpact":"DEGRADED_PERFORMANCE"}',
      ])
    })
  })

  it('masks a locked value of an object removed in Checkly that no change names', () => {
    const group = (extra: Record<string, unknown>) => ({
      id: 41,
      name: 'Backend',
      activated: true,
      muted: false,
      concurrency: 3,
      locations: ['eu-west-1'],
      tags: [],
      doubleCheck: false,
      retryStrategy: null,
      ...extra,
    })
    const lines = plain(generateConstructDiff({
      resource: { type: 'check-group', logicalId: 'backend', payload: group({}) },
      deployed: group({
        apiCheckDefaults: {
          url: 'https://api.example.com',
          headers: [{ key: 'X-Key', value: 'plain-at-deploy', locked: true }],
          queryParameters: [],
          assertions: [],
        },
      }),
      changes: [{ path: '/apiCheckDefaults/url', before: 'https://api.example.com' }],
      redactions: [{ path: '/apiCheckDefaults/headers/*/value', kind: 'value', when: 'locked' }],
    }))
    expect(changedLines(lines)).toContain('-        value: \'********\',')
    expect(lines.join('\n')).not.toContain('plain-at-deploy')
  })

  it('leaves the deployed resource and the changes as they were', () => {
    const deployed = apiCheck({ intent: { goal: 'Orders load', requiredOutcomes: ['Lists an order', 'Pages'], mustPreserve: [] } })
    const changes: GenerateDiffChange[] = [
      { path: '/intent/requiredOutcomes', before: ['Lists an order', 'Pages'], after: ['Lists every order'] },
      { path: '/intent/requiredOutcomes/1', before: undefined, after: 'Pages' },
      { path: '/intent/goal', before: 'Orders load', after: 'Orders load quickly' },
    ]
    const copies = structuredClone({ deployed, changes })
    drift(apiCheck({
      intent: { goal: 'Orders load quickly', constraints: [{ type: 'REQUIRED_OUTCOME', statement: 'Lists every order' }] },
    }), changes, { deployed })
    expect({ deployed, changes }).toEqual(copies)
  })

  it('renders a status page card\'s services by reference and by id on the deployed side', () => {
    const lines = plain(generateConstructDiff({
      resource: {
        type: 'status-page',
        logicalId: 'acme',
        payload: {
          id: 'page-uuid',
          name: 'ACME',
          url: 'acme-status',
          cards: [{ id: 'card-uuid', name: 'Card', services: [{ id: 'svc-b-uuid' }] }],
        },
      },
      deployed: { name: 'ACME', url: 'acme-status', cards: [{ name: 'Card', services: [{ ref: 'svc-a' }, { $id: 'svc-x-uuid' }] }] },
      changes: [{
        path: '/cards',
        before: [{ name: 'Card', services: [{ $ref: 'svc-a' }, { $id: 'svc-x-uuid' }] }],
        after: [{ name: 'Card', services: [{ $ref: 'svc-b' }] }],
      }],
      redactions: [],
      references: [
        { type: 'status-page-service', logicalId: 'svc-a', physicalId: 'svc-a-uuid', name: 'API' },
        { type: 'status-page-service', logicalId: 'svc-b', physicalId: 'svc-b-uuid', name: 'Web' },
      ],
    }, { referencedNames: { 'status-page-service': { 'svc-x-uuid': 'Database' } } }))
    expect(changedLines(lines)).toEqual([
      '-        StatusPageService.fromId(\'svc-a-uuid\'), // API',
      '-        StatusPageService.fromId(\'svc-x-uuid\'), // Database',
      '+        StatusPageService.fromId(\'svc-b-uuid\'), // Web',
    ])
  })

  describe('a drift captured from Checkly', () => {
    // Two checks of one project, deployed and then edited in the web app: an
    // intent's goal and an outcome, a plain header edited beside a locked
    // one and a locked one added, a variable unlocked at the deploy and
    // locked since, the legacy retry flag set with the strategy cleared, a
    // long setup script and a browser script edited, the group changed,
    // reminders removed, a location added and a tag replaced.
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/drift.json', import.meta.url), 'utf8')) as GenerateDiffInput[]
    const [apiInput, browserInput] = fixture

    it('renders every change of the API check as a construct diff', () => {
      const lines = plain(generateConstructDiff(apiInput))
      expect(changedLines(lines)).toEqual([
        '-    goal: \'The orders list loads\',',
        '+    goal: \'The orders list loads quickly\',',
        '-        statement: \'Lists at least one order\',',
        '+        statement: \'Lists every open order\',',
        '+    \'eu-west-1\',',
        '-    \'drift\',',
        '+    \'critical\',',
        '-  group: CheckGroupV2.fromId(2408), // Group A',
        '+  group: CheckGroupV2.fromId(2409), // Group B',
        '-  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {',
        '-    amount: 2,',
        '-    interval: 10,',
        '-  }, {',
        '+  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, undefined, {',
        '-  retryStrategy: RetryStrategyBuilder.linearStrategy({',
        '-    baseBackoffSeconds: 30,',
        '-    maxRetries: 3,',
        '-    maxDurationSeconds: 600,',
        '+  retryStrategy: RetryStrategyBuilder.singleRetry({',
        '+    baseBackoffSeconds: 0,',
        '-      value: \'********\',',
        '+      value: \'******** (changed)\',',
        '-      locked: false,',
        '+      locked: true,',
        '-        value: \'on\',',
        '+        value: \'off\',',
        '+        value: \'********\',',
        '+        locked: true,',
        '+      },',
        '+      {',
        '+        key: \'X-Added\',',
      ])
      expect(lines.filter(line => line.startsWith('note:') || line.startsWith('reason:'))).toEqual([
        'note: /localSetupScript: changed in Checkly (the deployed text is not available)',
        'note: secret changed: /request/headers',
      ])
    })

    it('notes a browser script whose deployed text is reported only by its hash', () => {
      expect(plain(generateConstructDiff(browserInput))).toEqual([
        'note: /script: changed in Checkly (the deployed text is not available)',
      ])
    })
  })
})
