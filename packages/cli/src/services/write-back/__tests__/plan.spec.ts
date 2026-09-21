import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiCheck } from '../../../constructs/api-check.js'
import { CheckGroup } from '../../../constructs/check-group.js'
import { EmailAlertChannel } from '../../../constructs/email-alert-channel.js'
import { HeartbeatMonitor } from '../../../constructs/heartbeat-monitor.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import { TcpMonitor } from '../../../constructs/tcp-monitor.js'
import { UrlMonitor } from '../../../constructs/url-monitor.js'
import type { DiffEntry, DiffRedaction } from '../../../rest/projects.js'
import * as constructs from '../../../constructs/index.js'
import { AgenticCheck } from '../../../constructs/agentic-check.js'
import { Check, RuntimeCheck, RepairableRuntimeCheck } from '../../../constructs/check.js'
import { CheckGroupV1 } from '../../../constructs/check-group-v1.js'
import { GrpcMonitor } from '../../../constructs/grpc-monitor.js'
import { Monitor } from '../../../constructs/monitor.js'
import * as literalEdit from '../literal-edit.js'
import { applyWriteBack, type ConstructClass, planWriteBack, RULES_BY_CLASS } from '../plan.js'

vi.mock('../literal-edit.js', async importOriginal => {
  const original = await importOriginal<typeof import('../literal-edit.js')>()
  return { ...original, evaluateLiteral: vi.fn(original.evaluateLiteral) }
})

/**
 * The planner (`plan.ts`): which remote changes of a plan become edits of
 * which file, what is refused and why, and that the files are written as
 * planned.
 */

let dir: string
let project: Project

/** Writes a source file into the temp project and declares the constructs it holds while `Session` points at it. */
async function declare<T> (name: string, source: string, build: () => T): Promise<T> {
  const file = path.join(dir, name)
  await fs.writeFile(file, source, 'utf8')
  Session.checkFileAbsolutePath = file
  try {
    return build()
  } finally {
    Session.checkFileAbsolutePath = undefined
  }
}

const read = (name: string) => fs.readFile(path.join(dir, name), 'utf8')

/** The rule table the API reports for a check: env var values and header values blanked when locked. */
const CHECK_REDACTIONS: DiffRedaction[] = [
  { path: '/environmentVariables/*/value', kind: 'value', when: 'lockedOrSecret' },
  { path: '/request/headers/*/value', kind: 'value', when: 'locked' },
  { path: '/request/basicAuth/password', kind: 'value' },
]

const API_SOURCE = `import { ApiCheck, Frequency } from 'checkly/constructs'

new ApiCheck('api', {
  name: 'API',
  activated: true,
  tags: ['a'],
  frequency: 10,
  request: {
    url: 'https://example.com',
    method: 'GET',
  },
})

new ApiCheck('other', {
  name: 'Other',
  frequency: Frequency.EVERY_5M,
  request: { url: 'https://example.com/other', method: 'GET' },
})
`

function apiEntry (overrides: Partial<DiffEntry> = {}): DiffEntry {
  return {
    type: 'check',
    logicalId: 'api',
    physicalId: 'a1',
    action: 'UPDATE',
    changes: [{ path: '/name', origin: 'remote', before: 'API', after: 'API renamed' }],
    before: {
      id: 'a1',
      checkType: 'API',
      name: 'API renamed',
      activated: true,
      tags: ['a', 'b'],
      frequency: 10,
      request: { url: 'https://example.com', method: 'GET', headers: [], basicAuth: { username: '', password: '' } },
      environmentVariables: [],
    },
    redactions: CHECK_REDACTIONS,
    ...overrides,
  }
}

beforeEach(async () => {
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'write-back-')))
  Session.reset()
  Session.project = new Project('proj', { name: 'Project' })
  project = Session.project
})

afterEach(async () => {
  Session.reset()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('planWriteBack', () => {
  it('writes a remote change into the construct and reports it', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
      new ApiCheck('other', { name: 'Other', request: { url: 'https://example.com/other', method: 'GET' } })
    })
    const plan = await planWriteBack({ diff: [apiEntry()], project, cwd: dir })
    expect(plan.skipped).toEqual([])
    expect(plan.applied).toEqual([{
      file: 'api.check.ts',
      type: 'check',
      logicalId: 'api',
      property: 'name',
      previous: '\'API\'',
      rendered: '\'API renamed\'',
      replacesLocalEdit: false,
    }])
    expect(plan.files).toEqual([{
      path: path.join(dir, 'api.check.ts'),
      text: API_SOURCE.replace('\'API\'', '\'API renamed\''),
      original: API_SOURCE,
    }])
    // Planning touches nothing.
    expect(await read('api.check.ts')).toBe(API_SOURCE)
    await applyWriteBack(plan)
    expect(await read('api.check.ts')).toBe(API_SOURCE.replace('\'API\'', '\'API renamed\''))
  })

  it('says nothing about a resource the deploy removes', async () => {
    const plan = await planWriteBack({
      diff: [{
        type: 'check',
        logicalId: 'gone',
        action: 'DELETE',
        changes: [{ path: '/name', origin: 'remote', before: 'a', after: 'b' }],
      }],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual([])
  })

  it('ignores entries with no remote change and folded relations', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [
        apiEntry({ changes: [{ path: '/name', origin: 'code', before: 'API', after: 'API v2' }] }),
        apiEntry({ foldedInto: { type: 'check', logicalId: 'api' } }),
        { type: 'check', logicalId: 'api', action: 'UNCHANGED' },
      ],
      project,
      cwd: dir,
    })
    expect(plan.applied).toEqual([])
    expect(plan.skipped).toEqual([])
    expect(plan.files).toEqual([])
  })

  it('marks a change the code made too, and writes the account value', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [apiEntry({
        changes: [{
          path: '/name', origin: 'both', before: 'API', after: 'API local', remote: { before: 'API', after: 'API renamed' },
        }],
      })],
      project,
      cwd: dir,
    })
    expect(plan.applied).toMatchObject([{ property: 'name', rendered: '\'API renamed\'', replacesLocalEdit: true }])
  })

  it('rewrites a whole set when elements were added and removed, and a plain list at its path', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [apiEntry({
        changes: [
          { path: '/tags/k1', origin: 'remote', after: 'b' },
          { path: '/tags/k2', origin: 'remote', before: 'c' },
          { path: '/request/headers', origin: 'remote', before: [], after: [{ key: 'x', value: '1', locked: false }] },
        ],
        before: { ...apiEntry().before, request: { url: 'https://example.com', method: 'GET', headers: [{ key: 'x', value: '1', locked: false }] } },
      })],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual([])
    expect(plan.applied.map(line => [line.property, line.rendered])).toEqual([
      ['tags', '[\'a\', \'b\']'],
      ['request.headers', `[
      {
        key: 'x',
        value: '1',
        locked: false,
      },
    ]`],
    ])
  })

  it('refuses a list the code also changed, and one whose changes disagree with the account', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const local = await planWriteBack({
      diff: [apiEntry({
        changes: [
          { path: '/tags/k1', origin: 'remote', after: 'b' },
          { path: '/tags/k2', origin: 'code', after: 'z' },
        ],
      })],
      project,
      cwd: dir,
    })
    expect(local.applied).toEqual([])
    expect(local.skipped).toEqual(['check api tags: your code also changed it since the last deploy; merge by hand'])

    const stale = await planWriteBack({
      diff: [
        apiEntry({ changes: [{ path: '/tags/k1', origin: 'remote', after: 'z' }] }),
        apiEntry({ logicalId: 'api', changes: [{ path: '/tags/k2', origin: 'remote', before: 'a' }] }),
      ],
      project,
      cwd: dir,
    })
    expect(stale.applied).toEqual([])
    expect(stale.skipped).toEqual([
      'check api tags: Checkly reported two different current values',
      'check api tags: Checkly reported two different current values',
    ])

    // One change carrying both sides is checked both ways.
    const swapped = await planWriteBack({
      diff: [apiEntry({ changes: [{ path: '/tags/k1', origin: 'remote', before: 'a', after: 'b' }] })],
      project,
      cwd: dir,
    })
    expect(swapped.skipped).toEqual(['check api tags: Checkly reported two different current values'])

    const noRemote = await planWriteBack({
      diff: [apiEntry({ changes: [{ path: '/name', origin: 'both', before: 'API', after: 'API local' }] })],
      project,
      cwd: dir,
    })
    expect(noRemote.skipped).toEqual(['check api name: Checkly did not report the value it holds'])
  })

  it('refuses what the table, the redactions and the change reports rule out', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const before = {
      ...apiEntry().before,
      description: 'x'.repeat(300),
      frequency: 0,
      frequencyOffset: 30,
      groupId: 7,
      retryStrategy: { type: 'FIXED' },
      script: 'console.log(1)',
      environmentVariables: [{ key: 'TOKEN', value: 'shh', locked: true }],
      request: {
        url: 'https://example.com',
        method: 'GET',
        headers: [{ key: 'auth', value: 'shh', locked: true }],
        basicAuth: { username: 'u', password: 'p' },
      },
    }
    const plan = await planWriteBack({
      diff: [apiEntry({
        before,
        changes: [
          { path: '/description', origin: 'remote', before: 'd', after: { $hash: 'abc' } },
          { path: '/frequency', origin: 'remote', before: 10, after: 0 },
          { path: '/frequencyOffset', origin: 'remote', after: 30 },
          { path: '/groupId', origin: 'remote', after: 7 },
          { path: '/retryStrategy', origin: 'remote', before: null, after: { type: 'FIXED' } },
          { path: '/script', origin: 'remote', before: 'a', after: 'console.log(1)' },
          { path: '/environmentVariables', origin: 'remote', before: [], after: [{ key: 'TOKEN', value: { $masked: 'changed' }, locked: true }], secret: true },
          { path: '/request/headers', origin: 'remote', before: [], after: [{ key: 'auth', value: '', locked: true }] },
          { path: '/request/basicAuth/password', origin: 'remote', before: '', after: 'p' },
          { path: '/codeBundle', origin: 'remote', cause: 'a new code bundle' },
          { path: '/alertChannels/k', origin: 'unmanaged', before: { alertChannelId: 1 } },
          { path: '/request/url', origin: 'remote', before: 'https://example.com', after: 'https://elsewhere.example.com' },
          { path: '/activated', origin: 'remote', before: true },
        ],
      })],
      project,
      cwd: dir,
    })
    // The long description came back in full in `before`, so it is the one thing written.
    expect(plan.applied.map(line => line.property)).toEqual(['description'])
    expect(plan.skipped).toEqual([
      'check api /frequencyOffset: a sub-minute schedule; use Frequency.EVERY_*S',
      'check api /groupId: references another resource',
      'check api /retryStrategy: spelled by the CLI, not a construct property',
      'check api /script: not a property this tool can update',
      'check api /environmentVariables: a secret changed; Checkly does not return its value',
      'check api /codeBundle: a new code bundle: content, not a property',
      'check api frequency: a sub-minute schedule; use Frequency.EVERY_*S',
      'check api request.headers: contains a locked or secret value that Checkly does not return',
      'check api request.basicAuth: contains a locked or secret value that Checkly does not return',
      'check api request.url: Checkly reported two different current values',
      'check api activated: Checkly reported two different current values',
    ])
  })

  it('writes a long value from `before` when the change only carries its hash', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const long = 'x'.repeat(300)
    const plan = await planWriteBack({
      diff: [apiEntry({
        before: { ...apiEntry().before, description: long },
        changes: [{ path: '/description', origin: 'remote', before: 'd', after: { $hash: 'abc' } }],
      })],
      project,
      cwd: dir,
    })
    expect(plan.applied).toMatchObject([{ property: 'description', previous: undefined, rendered: `'${long}'` }])
  })

  it('refuses a resource with no state, no redaction table, or a class this module does not know', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    class Wrapped extends ApiCheck {}
    await declare('wrapped.check.ts', `import { ApiCheck } from 'checkly'\nnew Wrapped('wrapped', { name: 'w' })\n`, () => {
      new Wrapped('wrapped', { name: 'w', request: { url: 'https://example.com', method: 'GET' } })
    })
    await declare('email.ts', `import { EmailAlertChannel } from 'checkly'\nnew EmailAlertChannel('mail', { address: 'a@b.c' })\n`, () => {
      new EmailAlertChannel('mail', { address: 'a@b.c' })
    })
    const plan = await planWriteBack({
      diff: [
        apiEntry({ before: undefined, redactions: undefined }),
        apiEntry({ redactions: undefined }),
        apiEntry({ logicalId: 'wrapped' }),
        apiEntry({ logicalId: 'gone' }),
        apiEntry({
          type: 'alert-channel',
          logicalId: 'mail',
          changes: [{ path: '/config/address', origin: 'remote', before: 'a@b.c', after: 'x@b.c' }],
        }),
      ],
      project,
      cwd: dir,
    })
    expect(plan.applied).toEqual([])
    expect(plan.skipped).toEqual([
      'check api: Checkly did not report its current state',
      'check api: Checkly did not report which of its values are secret',
      'check wrapped: Wrapped is not a class from checkly/constructs',
      'check gone: not found in the project',
      'alert-channel mail: updating the code is supported for checks and check groups only',
    ])
  })

  it('finds groups and monitors through their exported aliases and mapped paths', async () => {
    await declare('group.check.ts', `import { CheckGroup, HeartbeatCheck, UrlMonitor, TcpMonitor } from 'checkly/constructs'

export const group = new CheckGroup('grp', {
  name: 'Group',
  concurrency: 2,
  apiCheckDefaults: { url: 'https://example.com' },
})

new HeartbeatCheck('beat', { name: 'Beat', period: 1, periodUnit: 'hours', grace: 5, graceUnit: 'minutes' })

new UrlMonitor('url', { name: 'Url', request: { url: 'https://example.com' } })

new TcpMonitor('tcp', { name: 'Tcp', request: { hostname: 'example.com', port: 443 } })
`, () => {
      new CheckGroup('grp', { name: 'Group', concurrency: 2, apiCheckDefaults: { url: 'https://example.com' } })
      new HeartbeatMonitor('beat', { name: 'Beat', period: 1, periodUnit: 'hours', grace: 5, graceUnit: 'minutes' })
      new UrlMonitor('url', { name: 'Url', request: { url: 'https://example.com' } })
      new TcpMonitor('tcp', { name: 'Tcp', request: { hostname: 'example.com', port: 443 } })
    })
    const plan = await planWriteBack({
      diff: [
        {
          type: 'check-group',
          logicalId: 'grp',
          physicalId: 1,
          action: 'UPDATE',
          changes: [
            { path: '/concurrency', origin: 'remote', before: 2, after: 5 },
            { path: '/apiCheckDefaults/url', origin: 'remote', before: 'https://example.com', after: 'https://api.example.com' },
            { path: '/runParallel', origin: 'remote', before: false, after: true },
          ],
          before: { id: 1, name: 'Group', concurrency: 5, apiCheckDefaults: { url: 'https://api.example.com' }, runParallel: true },
          redactions: [],
        },
        {
          type: 'check',
          logicalId: 'beat',
          action: 'UPDATE',
          changes: [{ path: '/heartbeat/period', origin: 'remote', before: 1, after: 2 }],
          before: { checkType: 'HEARTBEAT', name: 'Beat', heartbeat: { period: 2, periodUnit: 'hours', grace: 5, graceUnit: 'minutes' } },
          redactions: [],
        },
        {
          type: 'check',
          logicalId: 'url',
          action: 'UPDATE',
          changes: [
            { path: '/request/url', origin: 'remote', before: 'https://example.com', after: 'https://www.example.com' },
            { path: '/maxResponseTime', origin: 'remote', before: 30000, after: 20000 },
          ],
          before: { checkType: 'URL', name: 'Url', request: { url: 'https://www.example.com' }, maxResponseTime: 20000 },
          redactions: [],
        },
        {
          type: 'check',
          logicalId: 'tcp',
          action: 'UPDATE',
          changes: [{ path: '/request/hostname', origin: 'remote', before: 'example.com', after: 'other.example.com' }],
          before: { checkType: 'TCP', name: 'Tcp', request: { hostname: 'other.example.com', port: 443 } },
          redactions: [],
        },
      ],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual([
      'check-group grp /runParallel: spelled by the CLI, not a construct property',
      'check tcp /request/hostname: not a property this tool can update',
    ])
    expect(plan.applied.map(line => [line.logicalId, line.property, line.rendered])).toEqual([
      ['grp', 'concurrency', '5'],
      ['grp', 'apiCheckDefaults.url', '\'https://api.example.com\''],
      ['beat', 'period', '2'],
      ['url', 'request.url', '\'https://www.example.com\''],
      ['url', 'maxResponseTime', '20000'],
    ])
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0].text).toBe(`import { CheckGroup, HeartbeatCheck, UrlMonitor, TcpMonitor } from 'checkly/constructs'

export const group = new CheckGroup('grp', {
  name: 'Group',
  concurrency: 5,
  apiCheckDefaults: { url: 'https://api.example.com' },
})

new HeartbeatCheck('beat', { name: 'Beat', period: 2, periodUnit: 'hours', grace: 5, graceUnit: 'minutes' })

new UrlMonitor('url', { name: 'Url', request: { url: 'https://www.example.com' }, maxResponseTime: 20000 })

new TcpMonitor('tcp', { name: 'Tcp', request: { hostname: 'example.com', port: 443 } })
`)
  })

  it('gives each class only the properties it takes', async () => {
    await declare('mixed.check.ts', `import { AgenticCheck, GrpcMonitor } from 'checkly/constructs'
new AgenticCheck('agent', { name: 'Agent', prompt: 'p' })
new GrpcMonitor('grpc', { name: 'Grpc', request: { host: 'example.com', port: 443, service: 'S', method: 'M' } })
`, () => {
      new AgenticCheck('agent', { name: 'Agent', prompt: 'p' } as any)
      new GrpcMonitor('grpc', { name: 'Grpc', request: { host: 'example.com', port: 443, service: 'S', method: 'M' } } as any)
    })
    const plan = await planWriteBack({
      diff: [
        {
          type: 'check',
          logicalId: 'agent',
          action: 'UPDATE',
          changes: [
            { path: '/shouldFail', origin: 'remote', before: false, after: true },
            { path: '/muted', origin: 'remote', before: false, after: true },
          ],
          before: { checkType: 'AGENTIC', name: 'Agent', shouldFail: true, muted: true },
          redactions: [],
        },
        {
          type: 'check',
          logicalId: 'grpc',
          action: 'UPDATE',
          changes: [{ path: '/maxResponseTime', origin: 'remote', before: 5000, after: 9000 }],
          before: { checkType: 'GRPC', name: 'Grpc', maxResponseTime: 9000 },
          redactions: [],
        },
      ],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual(['check agent /shouldFail: not a property this tool can update'])
    expect(plan.applied.map(line => [line.logicalId, line.property, line.rendered])).toEqual([
      ['agent', 'muted', 'true'],
      ['grpc', 'maxResponseTime', '9000'],
    ])
  })

  it('writes a period and its unit together or not at all', async () => {
    await declare('beat.check.ts', `import { HeartbeatMonitor } from 'checkly/constructs'
const unit = 'hours'
new HeartbeatMonitor('beat', { name: 'Beat', period: 1, periodUnit: unit, grace: 5, graceUnit: 'minutes' })
`, () => {
      new HeartbeatMonitor('beat', { name: 'Beat', period: 1, periodUnit: 'hours', grace: 5, graceUnit: 'minutes' })
    })
    const plan = await planWriteBack({
      diff: [{
        type: 'check',
        logicalId: 'beat',
        action: 'UPDATE',
        changes: [
          { path: '/heartbeat/period', origin: 'remote', before: 1, after: 30 },
          { path: '/heartbeat/periodUnit', origin: 'remote', before: 'hours', after: 'minutes' },
          { path: '/heartbeat/grace', origin: 'remote', before: 5, after: 10 },
        ],
        before: { checkType: 'HEARTBEAT', name: 'Beat', heartbeat: { period: 30, periodUnit: 'minutes', grace: 10, graceUnit: 'minutes' } },
        redactions: [],
      }],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual([
      'check beat period: written together with periodUnit',
      'check beat periodUnit: periodUnit is the variable unit, not a plain literal',
    ])
    expect(plan.applied.map(line => [line.property, line.rendered])).toEqual([['grace', '10']])
  })

  it('lists every construct class checkly/constructs exports, or excludes it on purpose', () => {
    // Abstract bases never appear in a project; every other check or group
    // class must be named so a new one cannot fall back to a base's rules.
    const abstract = new Set<ConstructClass>([Check, RuntimeCheck, RepairableRuntimeCheck, Monitor])
    const exported = Object.values(constructs).filter((value): value is ConstructClass =>
      typeof value === 'function'
      && (value.prototype instanceof Check || value.prototype instanceof CheckGroupV1 || value === CheckGroupV1)
      && !abstract.has(value as ConstructClass))
    expect(exported.length).toBeGreaterThan(10)
    for (const cls of exported) {
      expect(RULES_BY_CLASS.has(cls), `${cls.name} has no rules`).toBe(true)
    }
  })

  it('refuses a value carrying a marker, and a property the code spells as a helper', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
      new ApiCheck('other', { name: 'Other', request: { url: 'https://example.com/other', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [
        apiEntry({
          changes: [{ path: '/request/headers', origin: 'remote', before: [], after: [{ key: 'a', value: { $masked: 'changed' } }] }],
          before: { ...apiEntry().before, request: { url: 'https://example.com', method: 'GET', headers: [{ key: 'a', value: { $masked: 'changed' } }] } },
        }),
        apiEntry({
          logicalId: 'other',
          changes: [{ path: '/frequency', origin: 'remote', before: 5, after: 10 }],
          before: { checkType: 'API', name: 'Other', frequency: 10 },
        }),
      ],
      project,
      cwd: dir,
    })
    expect(plan.applied).toEqual([])
    expect(plan.skipped).toEqual([
      'check api request.headers: contains a value Checkly does not return in full',
      'check other frequency: frequency is Frequency.EVERY_5M, not a plain literal',
    ])
  })

  it('reports nothing for a change the code already holds', async () => {
    // The code moved to the same value Checkly holds (origin 'both'): there
    // is nothing to write and nothing to edit by hand.
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [apiEntry({
        before: { ...apiEntry().before, name: 'API' },
        changes: [{ path: '/name', origin: 'both', before: 'Old', after: 'API', remote: { before: 'Old', after: 'API' } }],
      })],
      project,
      cwd: dir,
    })
    expect(plan.applied).toEqual([])
    expect(plan.skipped).toEqual([])
    expect(plan.files).toEqual([])
  })

  it('edits the constructs it can find in a file and skips the one it cannot', async () => {
    await declare('api.check.ts', `import { ApiCheck } from 'checkly/constructs'
const opts = { name: 'Other' }
new ApiCheck('api', { name: 'API' })
new ApiCheck('other', opts)
`, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
      new ApiCheck('other', { name: 'Other', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({
      diff: [
        apiEntry(),
        apiEntry({ logicalId: 'other', before: { checkType: 'API', name: 'Other renamed' }, changes: [{ path: '/name', origin: 'remote', before: 'Other', after: 'Other renamed' }] }),
      ],
      project,
      cwd: dir,
    })
    expect(plan.skipped).toEqual(['check other: api.check.ts: its options are not a plain object literal'])
    expect(plan.applied.map(line => line.logicalId)).toEqual(['api'])
    expect(plan.files[0].text).toContain('new ApiCheck(\'api\', { name: \'API renamed\' })')
  })

  it('discards a whole file when an edit does not read back, even after another construct was edited', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
      new ApiCheck('other', { name: 'Other', request: { url: 'https://example.com/other', method: 'GET' } })
    })
    // The first construct reads back; the second's read-back is made to lie.
    vi.mocked(literalEdit.evaluateLiteral).mockImplementationOnce(node => literalEdit.evaluateLiteral(node))
      .mockImplementationOnce(() => 'something else')
    const plan = await planWriteBack({
      diff: [
        apiEntry(),
        apiEntry({ logicalId: 'other', before: { checkType: 'API', name: 'Other renamed' }, changes: [{ path: '/name', origin: 'remote', before: 'Other', after: 'Other renamed' }] }),
      ],
      project,
      cwd: dir,
    })
    expect(plan.files).toEqual([])
    expect(plan.applied).toEqual([])
    expect(plan.skipped).toEqual([
      'check api: api.check.ts: the edited file did not read back as expected at name',
      'check other: api.check.ts: the edited file did not read back as expected at name',
    ])
  })

  it('reports a construct whose call it cannot find or edit, and leaves the file alone', async () => {
    await declare('api.check.ts', `import { ApiCheck } from 'checkly'\nconst opts = { name: 'API' }\nnew ApiCheck('api', opts)\n`, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    const plan = await planWriteBack({ diff: [apiEntry()], project, cwd: dir })
    expect(plan.files).toEqual([])
    expect(plan.skipped).toEqual(['check api: api.check.ts: its options are not a plain object literal'])
  })

  it('reports a file it cannot read', async () => {
    await declare('api.check.ts', API_SOURCE, () => {
      new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    })
    await fs.rm(path.join(dir, 'api.check.ts'))
    const plan = await planWriteBack({ diff: [apiEntry()], project, cwd: dir })
    expect(plan.skipped).toEqual([expect.stringMatching(/^check api: could not read api\.check\.ts: ENOENT/)])
  })
})

describe('applyWriteBack', () => {
  it('keeps the file mode and writes through a symlink to its target', async () => {
    const real = path.join(dir, 'real.ts')
    // Group-writable: a bit the usual umask would clear on a fresh file. What
    // the platform actually stored is what must survive; on Windows, which
    // keeps no group bits, this only checks the mode is unchanged.
    await fs.writeFile(real, 'old')
    await fs.chmod(real, 0o664)
    const mode = (await fs.stat(real)).mode & 0o777
    const link = path.join(dir, 'link.ts')
    await fs.symlink(real, link)
    await applyWriteBack({ files: [{ path: link, text: 'new', original: 'old' }], applied: [], skipped: [] })
    expect(await fs.readFile(real, 'utf8')).toBe('new')
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    expect((await fs.stat(real)).mode & 0o777).toBe(mode)
    expect(await fs.readdir(dir)).toEqual(['link.ts', 'real.ts'])
  })

  it('refuses a file that changed since the plan was made', async () => {
    const file = path.join(dir, 'a.ts')
    await fs.writeFile(file, 'edited meanwhile', 'utf8')
    await expect(applyWriteBack({ files: [{ path: file, text: 'new', original: 'old' }], applied: [], skipped: [] }))
      .rejects.toThrow(/the file changed since the plan was made/)
    expect(await fs.readFile(file, 'utf8')).toBe('edited meanwhile')
  })

  it('says no file changed when the first write fails', async () => {
    const bad = path.join(dir, 'missing', 'bad.ts')
    await expect(applyWriteBack({ files: [{ path: bad, text: 'x', original: '' }], applied: [], skipped: [] }))
      .rejects.toThrow(/No file was changed\.$/)
  })

  it('names the files already written when a later one fails', async () => {
    const good = path.join(dir, 'good.ts')
    await fs.writeFile(good, 'old', 'utf8')
    const bad = path.join(dir, 'missing', 'bad.ts')
    // Paths are matched as text: a Windows path has backslashes a RegExp would read as escapes.
    const run = applyWriteBack({
      files: [{ path: good, text: 'new', original: 'old' }, { path: bad, text: 'x', original: '' }],
      applied: [],
      skipped: [],
    })
    await expect(run).rejects.toThrow('Could not write ')
    const failure = await run.catch((err: Error) => err.message)
    expect(failure).toContain(`Could not write ${bad}: `)
    expect(failure).toContain(`Already updated: ${good}.`)
    expect(await fs.readFile(good, 'utf8')).toBe('new')
    expect(await fs.readdir(dir)).toEqual(['good.ts'])
  })
})
