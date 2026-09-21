import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiCheck } from '../../../constructs/api-check.js'
import { CheckGroupV2 } from '../../../constructs/check-group-v2.js'
import { EmailAlertChannel } from '../../../constructs/email-alert-channel.js'
import { Project } from '../../../constructs/project.js'
import { Session } from '../../../constructs/session.js'
import type { DeployResourceSync, DiffEntry } from '../../../rest/projects.js'
import { formatPreview } from '../preview-output.js'
import { renderResourceDiff, type RenderedLine } from '../render.js'

// The construct diff has its own spec; here it is a fixed set of typed lines
// so the styling of every kind can be asserted.
vi.mock('../render.js', () => ({ renderResourceDiff: vi.fn(() => []) }))

/**
 * What `checkly deploy` prints for a plan (`preview-output.ts`): the overview
 * table, the diff blocks, the totals. Asserted without colour, which chalk
 * drops under a test runner anyway.
 */

// eslint-disable-next-line no-control-regex
const uncoloured = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '')

let project: Project

/** A project with a group, a channel and two checks, plus the local payload the deploy sends; with `testOnly`, a third check that is never deployed. */
function scenario ({ testOnly = false } = {}) {
  const group = new CheckGroupV2('grp', { name: 'Website Group' })
  const email = new EmailAlertChannel('email', { address: 'ops@example.com' })
  const api = new ApiCheck('api-health', {
    name: 'API health',
    group,
    alertChannels: [email],
    request: { url: 'https://api.example.com/v2/health', method: 'GET' },
  })
  const signup = new ApiCheck('signup', { name: 'Signup', request: { url: 'https://example.com/signup', method: 'GET' } })
  if (testOnly) {
    new ApiCheck('smoke', { name: 'Smoke', testOnly: true, request: { url: 'https://example.com', method: 'GET' } })
  }
  const local: DeployResourceSync[] = [
    { type: 'check-group', logicalId: 'grp', member: true, payload: group.synthesize() },
    { type: 'alert-channel', logicalId: 'email', member: true, payload: email.synthesize() },
    { type: 'check', logicalId: 'api-health', member: true, payload: api.synthesize(), sourceFile: 'src/api-health.check.ts' },
    { type: 'check', logicalId: 'signup', member: true, payload: signup.synthesize(), sourceFile: 'src/signup.check.ts' },
  ]
  return { local }
}

const unchangedEntries: DiffEntry[] = [
  { type: 'check-group', logicalId: 'grp', physicalId: 42, action: 'UNCHANGED' },
  { type: 'alert-channel', logicalId: 'email', physicalId: 7, action: 'UNCHANGED' },
]

const updateEntry: DiffEntry = {
  type: 'check',
  logicalId: 'api-health',
  physicalId: 'a1',
  action: 'UPDATE',
  sourceFile: 'src/api-health.check.ts',
  changes: [{ path: '/request/url', origin: 'code', before: 'https://api.example.com/v1/health', after: 'https://api.example.com/v2/health' }],
  before: { id: 'a1', checkType: 'API', name: 'API health' },
  redactions: [],
}

beforeEach(() => {
  Session.reset()
  Session.project = new Project('proj', { name: 'Website' })
  project = Session.project
  vi.mocked(renderResourceDiff).mockReturnValue([])
})

describe('formatPreview', () => {
  it('prints the heading, one row per touched resource, the unchanged count and the totals', () => {
    const { local } = scenario({ testOnly: true })
    const diff: DiffEntry[] = [
      ...unchangedEntries,
      updateEntry,
      { type: 'check', logicalId: 'signup', action: 'CREATE' },
      { type: 'check', logicalId: 'legacy-login', physicalId: 'c9', action: 'DELETE' },
      { type: 'dashboard', logicalId: 'old-dashboard', physicalId: 3, action: 'DETACH' },
    ]
    const text = uncoloured(formatPreview({
      heading: { title: 'Deploy preview', projectName: 'Website', accountName: 'Acme' },
      diff,
      project,
      rendering: { plan: diff, local },
      planToken: 'v1.token',
    }))
    expect(text).toBe([
      'Deploy preview · Website → account Acme',
      '',
      '  + ApiCheck   signup         src/signup.check.ts',
      '  ~ ApiCheck   api-health     src/api-health.check.ts',
      '  - Check      legacy-login   permanently deleted, run history lost',
      '  - Dashboard  old-dashboard  kept in your Checkly account, now managed from the Checkly web app',
      '  · ApiCheck   smoke          skipped (testOnly)',
      '    2 unchanged',
      '',
      '1 to create, 1 to update, 1 to delete, 1 kept in your account, 1 skipped (testOnly), 2 unchanged',
      'Deploy exactly this plan: checkly deploy --plan-token v1.token',
      '',
    ].join('\n'))
  })

  it('leaves out the heading, the token and the file column when it has none of them', () => {
    scenario({ testOnly: true })
    const text = uncoloured(formatPreview({
      diff: [{ type: 'check', logicalId: 'signup', action: 'CREATE' }],
      project,
    }))
    expect(text).toBe([
      '  + ApiCheck  signup',
      '  · ApiCheck  smoke   skipped (testOnly)',
      '',
      '1 to create, 1 skipped (testOnly), 0 unchanged',
      '',
    ].join('\n'))
  })

  it('takes the file from the plan entry when the local payload is not at hand', () => {
    scenario()
    // The stale-plan output has the plan and nothing else.
    const text = uncoloured(formatPreview({
      diff: [{ type: 'check', logicalId: 'api-health', physicalId: 'a1', action: 'UPDATE', sourceFile: 'src/api-health.check.ts' }],
      project,
    }))
    expect(text).toContain('  ~ ApiCheck  api-health  src/api-health.check.ts\n')
  })

  it('names the project alone when the account is unknown', () => {
    scenario()
    const text = uncoloured(formatPreview({
      heading: { title: 'Current plan', projectName: 'Website' },
      diff: [{ type: 'check', logicalId: 'signup', action: 'CREATE' }],
      project,
    }))
    expect(text.split('\n')[0]).toBe('Current plan · Website')
  })

  it('prints the name and id under a row with verbose', () => {
    scenario()
    const text = uncoloured(formatPreview({
      diff: [{ type: 'check', logicalId: 'api-health', physicalId: 'a1', action: 'UPDATE' }],
      project,
      verbose: true,
    }))
    expect(text).toContain('  ~ ApiCheck  api-health\n      name: API health\n      id: a1\n')
  })

  it('shows a check that just gained testOnly once, as deleted', () => {
    scenario({ testOnly: true })
    const text = uncoloured(formatPreview({
      diff: [{ type: 'check', logicalId: 'smoke', physicalId: 's1', action: 'DELETE' }],
      project,
    }))
    expect(text).toContain('  - Check  smoke  permanently deleted, run history lost')
    expect(text).not.toContain('skipped')
    expect(text).toContain('1 to delete, 0 unchanged')
  })

  it('lists a relation the deploy prunes, and warns about one it leaves alone', () => {
    scenario()
    const check: DiffEntry = {
      type: 'check',
      logicalId: 'api-health',
      physicalId: 'a1',
      action: 'UNCHANGED',
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }
    const relation: DiffEntry = {
      type: 'alert-channel-subscription',
      logicalId: 'unmanaged:7',
      physicalId: 7,
      action: 'DELETE',
      origin: 'unmanaged',
      foldedInto: { type: 'check', logicalId: 'api-health' },
    }
    const pruning = uncoloured(formatPreview({ diff: [check, relation], project, pruneRelations: true }))
    expect(pruning).toContain(
      '  - alert-channel-subscription  unmanaged:7  relation on Check api-health not managed by this project, '
      + 'deleted by --prune-relations',
    )
    // The check itself gets no row: its only change is the relation.
    expect(pruning).not.toContain('! Check')
    expect(pruning).toContain('1 relation pruned, 0 unchanged')

    const leaving = uncoloured(formatPreview({ diff: [check], project }))
    expect(leaving).toContain(
      '  ! Check  api-health  has alert channels or private locations this project does not manage'
      + ' (pass --prune-relations to delete them)',
    )
    expect(leaving).toContain('\n1 with relations this project does not manage, 0 unchanged')
  })

  it('prints the construct diff under its resource header, one style per line kind', () => {
    const { local } = scenario()
    const lines: RenderedLine[] = [
      { kind: 'hunk', text: '@@ -1,3 +1,3 @@' },
      { kind: 'context', text: '  name: \'API health\',' },
      { kind: 'remove', text: '  url: \'https://api.example.com/v1/health\',' },
      { kind: 'add', text: '  url: \'https://api.example.com/v2/health\',' },
      { kind: 'hunk', text: '@@ -9,2 +9,2 @@' },
      { kind: 'context', text: '  tags: [],' },
      { kind: 'note', text: '/codeBundle: changed (code bundle)' },
      { kind: 'note', text: '/script:' },
      { kind: 'nested', line: { kind: 'hunk', text: '@@ -1 +1 @@' } },
      { kind: 'nested', line: { kind: 'remove', text: 'console.log(1)' } },
      { kind: 'nested', line: { kind: 'add', text: 'console.log(2)' } },
      { kind: 'reason', text: '(could not render this resource: boom)' },
    ]
    vi.mocked(renderResourceDiff).mockReturnValue(lines)
    const diff = [...unchangedEntries, updateEntry]
    const text = uncoloured(formatPreview({ diff, project, rendering: { plan: diff, local } }))
    expect(text).toContain([
      '~ ApiCheck api-health  src/api-health.check.ts',
      '      name: \'API health\',',
      '  -   url: \'https://api.example.com/v1/health\',',
      '  +   url: \'https://api.example.com/v2/health\',',
      '    ⋯',
      '      tags: [],',
      '  ~ /codeBundle: changed (code bundle)',
      '  ~ /script:',
      '    - console.log(1)',
      '    + console.log(2)',
      '    (could not render this resource: boom)',
      '',
      '1 to update, 2 unchanged',
    ].join('\n'))
    expect(vi.mocked(renderResourceDiff)).toHaveBeenCalledWith(expect.objectContaining({ entry: updateEntry }))
  })

  it('prints no diff block for an update with nothing to render', () => {
    const { local } = scenario()
    const diff = [...unchangedEntries, updateEntry]
    const text = uncoloured(formatPreview({ diff, project, rendering: { plan: diff, local } }))
    expect(text).not.toContain('~ ApiCheck api-health  ')
    expect(text).toContain('  ~ ApiCheck  api-health  src/api-health.check.ts\n    2 unchanged\n\n1 to update, 2 unchanged')
  })

  it('reads as what happened once the plan was carried out', () => {
    scenario()
    const text = uncoloured(formatPreview({
      diff: [
        { type: 'check', logicalId: 'signup', action: 'CREATE' },
        { type: 'check', logicalId: 'api-health', physicalId: 'a1', action: 'UPDATE' },
        { type: 'check', logicalId: 'legacy-login', physicalId: 'c9', action: 'DELETE' },
      ],
      project,
      done: true,
    }))
    expect(text).toContain('\n1 created, 1 updated, 1 deleted, 0 unchanged\n')
  })

  it('says so when the plan is empty', () => {
    expect(formatPreview({ diff: [], project })).toContain('No checks were detected')
  })
})
