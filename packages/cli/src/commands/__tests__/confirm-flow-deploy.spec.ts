import path from 'node:path'

import { Parser } from '@oclif/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
  projects: { preview: vi.fn(), deploy: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('../../services/checkly-config-loader', async () => {
  const { Diagnostics } = await import('../../constructs/diagnostics.js')
  return {
    loadChecklyConfig: vi.fn().mockResolvedValue({
      config: {
        logicalId: 'my-project',
        projectName: 'My Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
        checks: {},
      },
      constructs: [],
      diagnostics: new Diagnostics(),
    }),
    resolveDependencyCacheVersion: vi.fn(),
  }
})

vi.mock('../../services/project-parser', () => ({
  parseProject: vi.fn(),
}))

vi.mock('../../services/util', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/util.js')>(),
  splitConfigFilePath: vi.fn().mockReturnValue({
    configDirectory: '.',
    configFilenames: ['checkly.config.ts'],
  }),
  getGitInformation: vi.fn(),
  getGitRepoRoot: vi.fn(),
}))

// Hoisted, because the mock factory below is hoisted above the module body.
const { storeBundle } = vi.hoisted(() => ({ storeBundle: vi.fn() }))

vi.mock('../../services/check-parser/bundler', () => ({
  Bundler: {
    createForWorkspace: vi.fn().mockResolvedValue({
      // Not empty, so the code bundle upload is on the table and the tests can
      // assert when it happens.
      isEmpty: false,
      updateMarker: vi.fn(),
      finalize: vi.fn().mockResolvedValue({ archiveFile: 'bundle.tgz', store: storeBundle }),
    }),
  },
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import { buildConfirmCommand } from '../../helpers/command-preview.js'
import * as api from '../../rest/api.js'
import {
  type DiffEntry,
  ProjectPlanStaleError,
  ProjectPreviewNotSupportedError,
} from '../../rest/projects.js'
import { Ok } from '../../services/check-parser/package-files/result.js'
import { parseProject } from '../../services/project-parser.js'
import { getGitRepoRoot } from '../../services/util.js'
import { EmailAlertChannel } from '../../constructs/email-alert-channel.js'
import { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import { AuthCommand } from '../authCommand.js'
import Deploy from '../deploy.js'

/** Turn a generated confirmCommand back into argv, so oclif can re-parse it. */
function flagArgv (confirmCommand: string): string[] {
  return [...confirmCommand.matchAll(/--[a-zA-Z0-9-]+(?:="[^"]*")?/g)]
    .map(([token]) => token.replace(/="(.*)"$/, '=$1'))
}

async function confirmCommandFor (argv: string[]): Promise<string> {
  const { flags, metadata } = await Parser.parse(argv, { flags: Deploy.flags, strict: true })
  return buildConfirmCommand('deploy', flags, undefined, metadata.flags)
}

function createConfirmContext () {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  return {
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    constructor: Deploy,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

const DEFAULT_FLAGS = {
  'force': false,
  'preview': false,
  'dry-run': false,
  'plan-token': undefined,
  'prune-relations': false,
  'output': false,
  'verbose': false,
  'config': undefined,
  'schedule-on-deploy': true,
  'preserve-resources': false,
  'cancel-in-progress-deployment': false,
  'verify-runtime-dependencies': true,
  'debug-bundle': false,
  'debug-bundle-output-file': './debug-bundle.json',
}

const DEFAULT_METADATA = {
  'preview': { setFromDefault: true },
  'dry-run': { setFromDefault: true },
  'prune-relations': { setFromDefault: true },
  'output': { setFromDefault: true },
  'verbose': { setFromDefault: true },
  'schedule-on-deploy': { setFromDefault: true },
  'preserve-resources': { setFromDefault: true },
  'cancel-in-progress-deployment': { setFromDefault: true },
  'verify-runtime-dependencies': { setFromDefault: true },
  'debug-bundle': { setFromDefault: true },
  'debug-bundle-output-file': { setFromDefault: true },
}

function createCommandContext (flags: Record<string, unknown> = {}) {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  const typed = Object.keys(flags)
  return {
    parse: vi.fn().mockResolvedValue({
      flags: { ...DEFAULT_FLAGS, ...flags },
      // A flag the test passes explicitly is one the user typed, so it is not
      // marked as coming from a default — which is what decides whether the
      // echoed confirmCommand repeats it.
      metadata: {
        flags: Object.fromEntries(
          Object.entries(DEFAULT_METADATA).filter(([key]) => !typed.includes(key)),
        ),
      },
    }),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    validateProject: (AuthCommand.prototype as any).validateProject,
    formatPreview: (Deploy.prototype as any).formatPreview,
    collectDeletions: (Deploy.prototype as any).collectDeletions,
    style: {
      outputFormat: undefined,
      diagnostics: vi.fn(),
      actionStart: vi.fn(),
      actionStatus: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      longError: vi.fn(),
      longWarning: vi.fn(),
      longInfo: vi.fn(),
      shortError: vi.fn(),
    },
    constructor: Deploy,
    account: { name: 'Test Account', runtimeId: 'runtime-default' },
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

const repoRoot = path.resolve('/home/user/repo')

function declareProject () {
  Session.reset()
  Session.workspace = Ok({} as any)
  const project = new Project('my-project', { name: 'My Project' })
  Session.project = project
  new EmailAlertChannel('ops', { address: 'ops@example.com' })
  vi.mocked(parseProject).mockResolvedValue(project)
  return project
}

/** The same project, with its constructs declared in a file inside `root`. */
function declareProjectIn (root: string) {
  Session.reset()
  Session.workspace = Ok({} as any)
  const project = new Project('my-project', { name: 'My Project' })
  Session.project = project
  Session.checkFileAbsolutePath = path.join(root, 'src', 'alerts.ts')
  new EmailAlertChannel('ops', { address: 'ops@example.com' })
  Session.checkFileAbsolutePath = undefined
  vi.mocked(parseProject).mockResolvedValue(project)
  return project
}

const PLAN_TOKEN = 'v1.AAAAAAAAAAAAAAAAAAAAAA'

const CHANGED: DiffEntry = {
  type: 'alert-channel',
  logicalId: 'ops',
  physicalId: 42,
  action: 'UPDATE',
  changes: [{ path: '/config/address', origin: 'code', before: 'old@example.com', after: 'ops@example.com' }],
  before: { type: 'EMAIL', config: { address: 'old@example.com' } },
}

const DELETED: DiffEntry = {
  type: 'check',
  logicalId: 'gone',
  physicalId: 7,
  action: 'DELETE',
}

function planResolves (diff: DiffEntry[] = [CHANGED, DELETED]) {
  vi.mocked(api.projects.preview).mockResolvedValue({ planToken: PLAN_TOKEN, diff })
}

const deployPreview = {
  command: 'deploy',
  description: 'Deploy project to Checkly',
  changes: ['Will deploy project "test-project" to account "Test Account"'],
  flags: { force: false },
  classification: {
    readOnly: Deploy.readOnly,
    destructive: Deploy.destructive,
    idempotent: Deploy.idempotent,
  },
}

describe('deploy confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    storeBundle.mockResolvedValue({ key: 'stored-bundle-key' })
    vi.mocked(api.projects.deploy).mockResolvedValue({ data: { project: {} as any, diff: [] } })
    declareProject()
  })

  afterEach(() => {
    Session.reset()
  })

  it('has correct metadata', () => {
    expect(Deploy.destructive).toBe(false)
    expect(Deploy.readOnly).toBe(false)
    expect(Deploy.idempotent).toBe(true)
  })

  it('exits 2 in agent mode without --force', async () => {
    const ctx = createConfirmContext()

    await expect(
      ctx.confirmOrAbort.call(ctx as any, deployPreview, { force: false }),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('deploy')
    expect(output.confirmCommand).toContain('--force')
  })

  it('passes through with --force in agent mode', async () => {
    const ctx = createConfirmContext()

    await ctx.confirmOrAbort.call(ctx as any, deployPreview, { force: true })

    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('asks once, with the plan and the token, and uploads nothing until then', async () => {
    planResolves()
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    // One preview, at the detail level this envelope carries: agent mode prints
    // the changed properties, so the values behind them are worth fetching.
    expect(api.projects.preview).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'full' })

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.status).toBe('confirmation_required')
    // The plan, in the envelope, next to the lines describing it.
    expect(output.preview.planToken).toBe(PLAN_TOKEN)
    expect(output.preview.diff).toHaveLength(2)
    expect(output.changes).toContain('Permanently delete Check: gone, losing its run history')
    expect(output.changes).toContain('Update AlertChannel: ops')
    // Re-running as told deploys the plan that was shown, not a newer one.
    expect(output.confirmCommand).toContain(`--plan-token="${PLAN_TOKEN}"`)
    expect(output.confirmCommand).toContain('--force')

    // Nothing was written and nothing was uploaded.
    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(storeBundle).not.toHaveBeenCalled()
  })

  it('leaves the resources\' full state out of the envelope', async () => {
    planResolves()
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    const entry = output.preview.diff.find((candidate: DiffEntry) => candidate.logicalId === 'ops')
    expect(entry).not.toHaveProperty('before')
    // The changed properties themselves stay: that is the point of the plan.
    expect(entry.changes).toEqual(CHANGED.changes)
  })

  it('leaves a value too large for the envelope out of it, whatever its shape', async () => {
    const script = 'a'.repeat(400)
    const variables = Array.from({ length: 40 }, (_, index) => ({ key: `K${index}`, value: 'v'.repeat(20) }))
    planResolves([{
      type: 'check',
      logicalId: 'chk',
      physicalId: 1,
      action: 'UPDATE',
      changes: [
        { path: '/script', origin: 'code', before: 'console.log(1)', after: script },
        { path: '/environmentVariables', origin: 'code', before: [], after: variables },
      ],
    }])
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    const [scriptChange, variablesChange] = output.preview.diff[0].changes
    // A long string and a large collection are both summarized; the small
    // values next to them are kept.
    expect(scriptChange.after).toEqual({ $omitted: script.length })
    expect(scriptChange.before).toBe('console.log(1)')
    expect(variablesChange.after).toEqual({ $omitted: JSON.stringify(variables).length })
    expect(variablesChange.before).toEqual([])
  })

  it('deploys the previewed plan, pinned to its token, with --force', async () => {
    planResolves()
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.preview).toHaveBeenCalledOnce()
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: PLAN_TOKEN })
    // The upload happens once the plan has been accepted, before the deploy.
    expect(storeBundle).toHaveBeenCalledOnce()
  })

  it('prints the plan and its token under --preview, and deploys nothing', async () => {
    planResolves()
    const ctx = createCommandContext({ preview: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.join('\n')).toContain(`Plan token: ${PLAN_TOKEN}`)
    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(storeBundle).not.toHaveBeenCalled()
  })

  it('prints the dry_run envelope with the plan and exits 0', async () => {
    planResolves()
    const ctx = createCommandContext({ 'dry-run': true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.status).toBe('dry_run')
    expect(output.preview.planToken).toBe(PLAN_TOKEN)
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('aborts when the plan no longer matches the token the user pinned', async () => {
    planResolves()
    const ctx = createCommandContext({ 'force': true, 'plan-token': 'v1.BBBBBBBBBBBBBBBBBBBBBB' })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(storeBundle).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      expect.stringContaining('no longer matches the plan'),
      expect.any(String),
    )
  })

  it('deploys with the token when it matches', async () => {
    planResolves()
    const ctx = createCommandContext({ 'force': true, 'plan-token': PLAN_TOKEN })

    await Deploy.prototype.run.call(ctx as any)

    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: PLAN_TOKEN })
  })

  it('refuses --prune-relations against an API without the preview endpoint', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    const ctx = createCommandContext({ 'force': true, 'prune-relations': true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      expect.stringContaining('cannot prune relations'),
      expect.any(String),
    )
  })

  it('deploys without a plan token when the preview fails', async () => {
    // One resource Checkly cannot report on must not make the project
    // undeployable: the deploy goes ahead, just unpinned.
    vi.mocked(api.projects.preview).mockRejectedValue(new Error('Could not read resource check:api-check'))
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.style.longWarning).toHaveBeenCalledWith(
      expect.stringContaining('Could not check what this deploy would change'),
      expect.any(String),
    )
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: undefined })
  })

  it('aborts when the user pinned a plan the API cannot check', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    const ctx = createCommandContext({ 'force': true, 'plan-token': PLAN_TOKEN })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('deploys a payload an API without the preview endpoint accepts', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    // The payload has to carry the fields before stripping them can mean
    // anything: a repository root makes every construct report its sourceFile.
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.deploy).toHaveBeenCalledOnce()
    const [payload, options] = vi.mocked(api.projects.deploy).mock.calls[0]
    expect(options).toMatchObject({ planToken: undefined })
    // None of the fields that arrived with the preview endpoint are sent: an
    // older API rejects a key it does not know rather than ignoring it.
    const [resource] = payload.resources
    expect(resource).not.toHaveProperty('sourceFile')
    expect(resource.payload).not.toHaveProperty('codeBundleSha256')
  })

  it('sends those same fields to an API that does support the endpoint', async () => {
    // The other half of the fallback: without it, a passing strip test could
    // mean the fields are never produced at all.
    planResolves()
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    const [payload] = vi.mocked(api.projects.deploy).mock.calls[0]
    expect(payload.resources[0]).toHaveProperty('sourceFile', 'src/alerts.ts')
  })

  it('sends a payload the deploy route accepts when a preview fails and nothing was uploaded', async () => {
    // A --preview run against a current API whose preview endpoint is busy: no
    // plan, no uploads, so the snapshots have no storage key — which the
    // dry-run deploy route requires, like every write route.
    vi.mocked(api.projects.preview).mockRejectedValue(new Error('the project is busy'))
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const ctx = createCommandContext({ preview: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(storeBundle).not.toHaveBeenCalled()
    const [payload, options] = vi.mocked(api.projects.deploy).mock.calls[0]
    expect(options).toMatchObject({ dryRun: true })
    // The fields the route cannot accept in this state are gone.
    const [resource] = payload.resources
    expect(resource).not.toHaveProperty('sourceFile')
    expect(resource.payload).not.toHaveProperty('codeBundleSha256')
  })

  it('falls back to the dry-run delete guard, uploads first, and asks with what it found', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: {
        project: {} as any,
        diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }],
      },
    })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    // Without a plan the deletions are only visible in a dry-run deploy, which
    // validates the storage keys — so the uploads have to precede it.
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ dryRun: true })
    expect(storeBundle).toHaveBeenCalled()

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.changes).toContain('Permanently delete Check: gone, losing its run history')
    // No plan, so nothing to pin: the envelope carries no structured preview.
    expect(output.preview).toBeUndefined()
    expect(output.confirmCommand).not.toContain('--plan-token')
  })

  it('plans again instead of failing an unattended deploy whose plan went stale', async () => {
    // Nobody reviewed this plan, so there is nothing to protect: a write that
    // lands while the code bundle uploads must not fail the pipeline.
    const fresh = 'v1.BBBBBBBBBBBBBBBBBBBBBB'
    vi.mocked(api.projects.preview)
      .mockResolvedValueOnce({ planToken: PLAN_TOKEN, diff: [CHANGED] })
      .mockResolvedValueOnce({ planToken: fresh, diff: [CHANGED] })
    vi.mocked(api.projects.deploy)
      .mockRejectedValueOnce(new ProjectPlanStaleError('The project changed since the preview.', []))
      .mockResolvedValueOnce({ data: { project: {} as any, diff: [] } })
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.preview).toHaveBeenCalledTimes(2)
    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    // The retry carries the token of the plan it just computed; re-sending the
    // refused one would be refused again.
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: PLAN_TOKEN })
    expect(vi.mocked(api.projects.deploy).mock.calls[1][1]).toMatchObject({ planToken: fresh })
    expect(ctx.style.longError).not.toHaveBeenCalled()
  })

  it('refuses a pinned deploy whose plan went stale rather than re-planning', async () => {
    planResolves()
    vi.mocked(api.projects.deploy).mockRejectedValue(
      new ProjectPlanStaleError('The project changed since the preview.', []),
    )
    const ctx = createCommandContext({ 'force': true, 'plan-token': PLAN_TOKEN })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.preview).toHaveBeenCalledTimes(1)
    expect(api.projects.deploy).toHaveBeenCalledTimes(1)
  })

  it('asks for property values only where they are reported', async () => {
    planResolves()

    // Nothing reports them: --force prints the deploy's own result, and the
    // terminal output lists resources rather than properties.
    await Deploy.prototype.run.call(createCommandContext({ force: true }) as any)
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'changes' })

    // --output and --preview print the rendered construct diff of every
    // updated resource, which needs each one's deployed state.
    vi.mocked(api.projects.preview).mockClear()
    await Deploy.prototype.run.call(createCommandContext({ force: true, output: true }) as any)
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'full' })

    vi.mocked(api.projects.preview).mockClear()
    await Deploy.prototype.run.call(createCommandContext({ preview: true }) as any)
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'full' })

    // --dry-run prints the envelope, which carries the changed properties.
    vi.mocked(api.projects.preview).mockClear()
    await expect(Deploy.prototype.run.call(createCommandContext({ 'dry-run': true }) as any))
      .rejects.toThrow('EXIT_0')
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'full' })
  })

  it('prints the construct diff under an updated resource of the preview', async () => {
    planResolves([{ ...CHANGED, redactions: [] }])

    const context = createCommandContext({ preview: true })
    await Deploy.prototype.run.call(context as any)
    const output = context.logged.join('\n')
    expect(output).toContain('Update:')
    expect(output).toContain('--- deployed')
    expect(output).toContain('-  address: \'old@example.com\'')
    expect(output).toContain('+  address: \'ops@example.com\'')
    // The variable is named after the logical id on both sides, so the
    // address it would otherwise be named after is not a second change.
    expect(output).toContain(' export const opsAlert = new EmailAlertChannel(\'ops\', {')
    expect(output).not.toContain('-export const')
  })

  it('does not advise --prune-relations to a run that passed it', async () => {
    // The relation is already listed as one this deploy deletes; telling the
    // user to pass the flag they just passed would be absurd.
    planResolves([
      {
        type: 'check',
        logicalId: 'chk',
        physicalId: 1,
        action: 'UNCHANGED',
        changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
      },
      {
        type: 'alert-channel-subscription',
        logicalId: 'unmanaged:7',
        physicalId: 7,
        action: 'DELETE',
        origin: 'unmanaged',
        foldedInto: { type: 'check', logicalId: 'chk' },
      },
    ])
    const ctx = createCommandContext({ 'preview': true, 'prune-relations': true })

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('Prune (relations not managed by this project):')
    expect(printed).not.toContain('pass --prune-relations to delete them')
  })

  it('reports an unmanaged relation without advising anything twice when it will not prune', async () => {
    planResolves([{
      type: 'check',
      logicalId: 'chk',
      physicalId: 1,
      action: 'UNCHANGED',
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }])
    const ctx = createCommandContext({ preview: true })

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('pass --prune-relations to delete them')
    expect(printed).not.toContain('Update:')
  })

  it('names every relation a pruning deploy would delete', async () => {
    // The one prompt that gates this deploy has to say what it deletes, and a
    // pruned relation is reported on its own entry, folded into its parent.
    planResolves([
      {
        type: 'check',
        logicalId: 'chk',
        physicalId: 1,
        action: 'UNCHANGED',
        changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
      },
      {
        type: 'alert-channel-subscription',
        logicalId: 'unmanaged:7',
        physicalId: 7,
        action: 'DELETE',
        origin: 'unmanaged',
        foldedInto: { type: 'check', logicalId: 'chk' },
      },
    ])
    const ctx = createCommandContext({ 'prune-relations': true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.changes).toContain(
      'Delete the alert-channel-subscription on Check: chk, which this project does not manage',
    )
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ pruneRelations: true })
  })

  it('does not call a resource an update when only its unmanaged relations changed', async () => {
    // Checkly reports those on the owning resource whether or not the deploy
    // would delete them; without --prune-relations it deletes nothing.
    planResolves([{
      type: 'check',
      logicalId: 'chk',
      physicalId: 1,
      action: 'UNCHANGED',
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }])
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.changes).not.toContain('Update Check: chk')
    // It is still in the plan the envelope carries, so an agent can see it.
    expect(output.preview.diff).toHaveLength(1)
  })

  it('prints the current plan and fails when the deploy refuses a stale one', async () => {
    planResolves()
    const fresh: DiffEntry[] = [{
      type: 'alert-channel',
      logicalId: 'ops',
      physicalId: 42,
      action: 'UPDATE',
      changes: [{ path: '/config/address', origin: 'remote', before: 'ops@example.com', after: 'someone@else.com' }],
    }]
    vi.mocked(api.projects.deploy).mockRejectedValue(
      new ProjectPlanStaleError('The project changed since the preview.', fresh),
    )
    const ctx = createCommandContext({ 'force': true, 'plan-token': PLAN_TOKEN })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(ctx.style.longError).toHaveBeenCalledWith(
      expect.stringContaining('changed while this deploy was being confirmed'),
      // Re-running is the way out: the refused token describes a state the
      // account has left behind, so it must not be sent again.
      expect.stringContaining('Re-run `checkly deploy`'),
    )
  })
})

describe('deploy confirmCommand', () => {
  it('echoes only the flags the user typed', async () => {
    expect(await confirmCommandFor([])).toBe('checkly deploy --force')
    expect(await confirmCommandFor(['--preserve-resources'])).toBe('checkly deploy --preserve-resources --force')
  })

  it('keeps an explicit --no-<flag> for flags that allow it', async () => {
    expect(await confirmCommandFor(['--no-schedule-on-deploy']))
      .toBe('checkly deploy --no-schedule-on-deploy --force')
  })

  it('generates a command oclif can parse back', async () => {
    const argvs = [
      [],
      ['--preserve-resources'],
      ['--no-schedule-on-deploy'],
      ['--verbose'],
      ['--prune-relations'],
      ['--plan-token', PLAN_TOKEN],
    ]
    for (const argv of argvs) {
      const confirmCommand = await confirmCommandFor(argv)
      await expect(
        Parser.parse(flagArgv(confirmCommand), { flags: Deploy.flags, strict: true }),
        `confirmCommand for "checkly deploy ${argv.join(' ')}" must be runnable: ${confirmCommand}`,
      ).resolves.toBeDefined()
    }
  })
})
