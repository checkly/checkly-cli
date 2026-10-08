import fs from 'node:fs/promises'
import os from 'node:os'
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

vi.mock('../../services/write-back/plan', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/write-back/plan.js')>()
  return { ...original, applyWriteBack: vi.fn(original.applyWriteBack) }
})

import prompts from 'prompts'

import { detectCliMode } from '../../helpers/cli-mode.js'
import { buildConfirmCommand } from '../../helpers/command-preview.js'
import * as api from '../../rest/api.js'
import { ConflictError, ValidationError } from '../../rest/errors.js'
import {
  type DiffEntry,
  ProjectPlanStaleError,
  ProjectPlanDisabledError,
  ProjectPreviewNotSupportedError,
} from '../../rest/projects.js'
import { Ok } from '../../services/check-parser/package-files/result.js'
import { parseProject } from '../../services/project-parser.js'
import { getGitRepoRoot } from '../../services/util.js'
import { applyWriteBack } from '../../services/write-back/plan.js'
import { ApiCheck } from '../../constructs/api-check.js'
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
  'plan': false,
  'plan-token': undefined,
  'prune-relations': false,
  'output': false,
  'verbose': false,
  'config': undefined,
  'schedule-on-deploy': true,
  'schedule-on-deploy-threshold': 'auto',
  'schedule-on-deploy-min-frequency': 'auto',
  'preserve-resources': false,
  'cancel-in-progress-deployment': false,
  'verify-runtime-dependencies': true,
  'debug-bundle': false,
  'debug-bundle-output-file': './debug-bundle.json',
}

const DEFAULT_METADATA = {
  'preview': { setFromDefault: true },
  'dry-run': { setFromDefault: true },
  'plan': { setFromDefault: true },
  'prune-relations': { setFromDefault: true },
  'output': { setFromDefault: true },
  'verbose': { setFromDefault: true },
  'schedule-on-deploy': { setFromDefault: true },
  'schedule-on-deploy-threshold': { setFromDefault: true },
  'schedule-on-deploy-min-frequency': { setFromDefault: true },
  'preserve-resources': { setFromDefault: true },
  'cancel-in-progress-deployment': { setFromDefault: true },
  'verify-runtime-dependencies': { setFromDefault: true },
  'debug-bundle': { setFromDefault: true },
  'debug-bundle-output-file': { setFromDefault: true },
}

/**
 * A `checkly deploy` run with the flags given. Most of this file is about a
 * planned deploy, so the run is one started with `--plan` unless the flags say
 * `plan: false`, which is a run that did not type it.
 */
function createCommandContext (given: Record<string, unknown> = {}) {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  const { plan = true, ...rest } = given
  const flags: Record<string, unknown> = plan === true ? { plan, ...rest } : rest
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
    // Re-running as told deploys the plan that was shown, not a newer one. It
    // asks for a plan itself, without which the token would be refused.
    expect(output.confirmCommand).toMatch(/ --plan( |$)/)
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
    // The deploy is asked to apply a plan, and which one.
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ plan: true, planToken: PLAN_TOKEN })
    // The upload happens once the plan has been accepted, before the deploy.
    expect(storeBundle).toHaveBeenCalledOnce()
  })

  it('prints the plan and its token under --preview, and deploys nothing', async () => {
    planResolves()
    const ctx = createCommandContext({ preview: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.join('\n')).toContain('Deploy preview · My Project → account Test Account')
    expect(ctx.logged.join('\n')).toContain(`checkly deploy --plan --plan-token ${PLAN_TOKEN}`)
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
    // Without a plan in hand the deploy is not asked to apply one either.
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ plan: false, planToken: undefined })
  })

  it('deploys without a plan, and the payload as it is, while Checkly has plans switched off', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPlanDisabledError())
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.style.longWarning).toHaveBeenCalledWith(
      'Checkly has deploy plans switched off at the moment.',
      expect.any(String),
    )
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    const [payload, options] = vi.mocked(api.projects.deploy).mock.calls[0]
    expect(options).toMatchObject({ plan: false, planToken: undefined })
    // This API knows the fields that arrived with the preview endpoint, so
    // they are sent: stripping them would blank the content hashes it stores.
    expect(payload.resources[0]).toHaveProperty('sourceFile', 'src/alerts.ts')
  })

  it('refuses to prune or to deploy a pinned plan while Checkly has plans switched off', async () => {
    for (const flags of [{ 'prune-relations': true }, { 'plan-token': PLAN_TOKEN }]) {
      vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPlanDisabledError())
      const ctx = createCommandContext({ force: true, ...flags })

      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

      expect(api.projects.deploy).not.toHaveBeenCalled()
      expect(JSON.stringify(vi.mocked(ctx.style.longError).mock.calls[0])).toContain('switched off')
    }
  })

  it('says so when plans were switched off between the plan and the deploy', async () => {
    planResolves()
    vi.mocked(api.projects.deploy).mockRejectedValue(new ValidationError({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Deploy plans are switched off at the moment, so a deploy that is pinned to a plan token cannot run.',
      code: 'DEPLOY_PLAN_DISABLED',
    }))
    const ctx = createCommandContext({ force: true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    // Not the refusal as the API words it, which tells the caller to drop a
    // token this run never asked the user for.
    expect(ctx.style.longError).toHaveBeenCalledWith(
      expect.stringContaining('switched deploy plans off while this deploy was being prepared'),
      'Re-run the command. While plans are switched off it deploys without one.',
    )
    expect(api.projects.deploy).toHaveBeenCalledOnce()
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

  it('falls back to the dry-run delete guard and asks with what it found, uploading nothing', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: {
        project: {} as any,
        diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }],
      },
    })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    // Without a plan the deletions are only visible in a dry-run deploy. It is
    // sent without storage keys, so an answer of no leaves nothing in storage.
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ dryRun: true })
    expect(storeBundle).not.toHaveBeenCalled()

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
    expect(output).toMatch(/^ {2}~ EmailAlertChannel {2}ops$/m)
    expect(output).not.toContain('--- deployed')
    expect(output).toContain('-   address: \'old@example.com\'')
    expect(output).toContain('+   address: \'ops@example.com\'')
    // The variable is named after the logical id on both sides, so the
    // address it would otherwise be named after is not a second change.
    expect(output).toContain('    export const opsAlert = new EmailAlertChannel(\'ops\', {')
    expect(output).not.toContain('- export const')
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
    expect(printed).toContain('relation on Check chk not managed by this project, deleted by --prune-relations')
    expect(printed).not.toContain('pass --plan --prune-relations to delete them')
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
    expect(printed).toContain('pass --plan --prune-relations to delete them')
    expect(printed).not.toMatch(/^ {2}~ /m)
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
    // Such a plan has nothing to apply and nobody is asked to confirm it, so
    // the envelope is the one --dry-run prints.
    const ctx = createCommandContext({ 'dry-run': true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.changes).not.toContain('Update Check: chk')
    // It is still in the plan the envelope carries, so an agent can see it.
    expect(output.preview.diff).toHaveLength(1)
  })

  it('prints what the deploy did, in the past tense, under --output', async () => {
    planResolves()
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: {
        project: {} as any,
        diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }],
      },
    })
    const ctx = createCommandContext({ force: true, output: true })

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toMatch(/^ {2}- Check {2}gone {2}permanently deleted, run history lost$/m)
    expect(printed).toContain('\n1 deleted, 0 unchanged\n')
    expect(printed).not.toContain('Deploy preview')
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

    expect(ctx.logged.join('\n')).toContain('Current plan · My Project → account Test Account')
    expect(ctx.style.longError).toHaveBeenCalledWith(
      expect.stringContaining('changed while this deploy was being confirmed'),
      // Re-running is the way out: the refused token describes a state the
      // account has left behind, so it must not be sent again.
      expect.stringContaining('Re-run `checkly deploy --plan`'),
    )
  })
})

describe('deploy confirmation in a terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    storeBundle.mockResolvedValue({ key: 'stored-bundle-key' })
    vi.mocked(api.projects.deploy).mockResolvedValue({ data: { project: {} as any, diff: [] } })
    declareProject()
  })

  afterEach(() => {
    Session.reset()
  })

  it('shows the rendered plan, then asks whether to apply it', async () => {
    // A `full` plan carries each entry's redaction rules; the construct diff
    // renders only from such an entry.
    planResolves([{ ...CHANGED, redactions: [] }, DELETED])
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    // The construct diff needs each changed resource's deployed state.
    expect(vi.mocked(api.projects.preview).mock.calls[0][1]).toMatchObject({ detail: 'full' })

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('Deploy preview')
    expect(printed).toMatch(/^ {2}~ EmailAlertChannel {2}ops$/m)
    expect(printed).toMatch(/^ {2}- Check +gone +permanently deleted, run history lost$/m)
    expect(printed).toContain('-   address: \'old@example.com\'')
    expect(printed).toContain('+   address: \'ops@example.com\'')
    // The options follow the plan; the resources are not listed a second time,
    // and the token is not advertised since this run pins it.
    expect(printed).toContain('This will:\n  - Deploy project "My Project" to account "Test Account"')
    expect(printed).not.toContain('Update AlertChannel: ops')
    expect(printed).not.toContain('--plan-token')
    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ message: 'Apply these changes?' })

    // Applying uploads and deploys the plan that was shown.
    expect(storeBundle).toHaveBeenCalledOnce()
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: PLAN_TOKEN })
  })

  it('cancels without uploading or deploying anything', async () => {
    planResolves()
    vi.mocked(prompts).mockResolvedValue({ confirm: false })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    expect(ctx.logged.join('\n')).toContain('Deploy preview')
    expect(storeBundle).not.toHaveBeenCalled()
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('prints no plan for a forced run', async () => {
    planResolves()
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(prompts).not.toHaveBeenCalled()
    expect(ctx.logged.join('\n')).not.toContain('Deploy preview')
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('prints the plan before the prompt and what was done after, under --output', async () => {
    planResolves()
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: { project: {} as any, diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }] },
    })
    const ctx = createCommandContext({ output: true })

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('\n1 to update, 1 to delete, 0 unchanged\n')
    expect(printed).toContain('\n1 deleted, 0 unchanged\n')
    expect(printed.indexOf('1 to update')).toBeLessThan(printed.indexOf('1 deleted'))
  })

  it('lists what the dry run found when there is no plan to render', async () => {
    vi.mocked(api.projects.preview).mockRejectedValue(new ProjectPreviewNotSupportedError())
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: { project: {} as any, diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }] },
    })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).not.toContain('Deploy preview')
    expect(printed).toContain('  - Permanently delete Check: gone, losing its run history')
    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ message: 'Proceed?' })
    // The dry run, then the deploy the user confirmed.
    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    const confirmed = vi.mocked(api.projects.deploy).mock.calls[1][1]
    expect(confirmed?.dryRun).toBeFalsy()
    expect(confirmed?.planToken).toBeUndefined()
  })
})

describe('deploy without --plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    storeBundle.mockResolvedValue({ key: 'stored-bundle-key' })
    vi.mocked(api.projects.deploy).mockResolvedValue({ data: { project: {} as any, diff: [] } })
    declareProject()
  })

  afterEach(() => {
    Session.reset()
  })

  it('asks with the deletions the dry run found, without a plan', async () => {
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: { project: {} as any, diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }] },
    })
    const ctx = createCommandContext({ plan: false })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.preview).not.toHaveBeenCalled()
    expect(ctx.style.actionStart).not.toHaveBeenCalledWith('Checking what would change')
    const printed = ctx.logged.join('\n')
    expect(printed).not.toContain('Deploy preview')
    expect(printed).toContain('  - Deploy project "My Project" to account "Test Account"')
    expect(printed).toContain('  - Permanently delete Check: gone, losing its run history')
    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ message: 'Proceed?' })

    // The dry run that found the deletion, then the confirmed deploy, neither
    // pinned to a token.
    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ dryRun: true })
    const confirmed = vi.mocked(api.projects.deploy).mock.calls[1][1]
    expect(confirmed?.dryRun).toBeFalsy()
    expect(confirmed?.planToken).toBeUndefined()
    // The code bundle went up after the answer, not before the question.
    expect(storeBundle).toHaveBeenCalledOnce()
    expect(storeBundle.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(prompts).mock.invocationCallOrder[0])
  })

  it('uploads nothing when the answer is no', async () => {
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: { project: {} as any, diff: [{ type: 'check', logicalId: 'gone', physicalId: 7, action: 'DELETE' }] },
    })
    vi.mocked(prompts).mockResolvedValueOnce({ confirm: false })
    const ctx = createCommandContext({ plan: false })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_')

    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ dryRun: true })
    expect(storeBundle).not.toHaveBeenCalled()
  })

  it('deploys straight away with --force', async () => {
    const ctx = createCommandContext({ plan: false, force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.preview).not.toHaveBeenCalled()
    expect(prompts).not.toHaveBeenCalled()
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ planToken: undefined })
  })

  it('sends the older payload once when the API rejects the full one, and says so', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    vi.mocked(api.projects.deploy)
      .mockRejectedValueOnce(new ValidationError({ statusCode: 400, error: 'Bad Request', message: '"sourceFile" is not allowed' }))
      .mockResolvedValueOnce({ data: { project: {} as any, diff: [] } })
    const ctx = createCommandContext({ plan: false, force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    const [first] = vi.mocked(api.projects.deploy).mock.calls[0]
    const [second] = vi.mocked(api.projects.deploy).mock.calls[1]
    expect(first.resources[0]).toHaveProperty('sourceFile')
    expect(second.resources[0]).not.toHaveProperty('sourceFile')
    expect(ctx.style.longWarning).toHaveBeenCalledWith(
      expect.stringContaining('does not know the fields the preview endpoint added'),
      expect.any(String),
    )
  })

  it('treats a raw 400 naming such a field the same way, and surfaces the first refusal when both fail', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const first = Object.assign(
      new Error('"resources[0].sourceFile" is not allowed'),
      { response: { status: 400, data: { message: '"resources[0].sourceFile" is not allowed' } } },
    )
    const second = new ValidationError({ statusCode: 400, error: 'Bad Request', message: 'something else' })
    vi.mocked(api.projects.deploy).mockRejectedValueOnce(first).mockRejectedValueOnce(second)
    const ctx = createCommandContext({ plan: false, force: true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.projects.deploy).mock.calls[1][0].resources[0]).not.toHaveProperty('sourceFile')
    expect(ctx.style.longError).toHaveBeenCalledWith(expect.any(String), first)
    expect(ctx.style.longWarning).not.toHaveBeenCalled()
  })

  it('does not retry a refusal that is not about an unknown field', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    for (const message of ['"frequency" must be a number', '"resources[0].sourceFile" must be a string']) {
      vi.mocked(api.projects.deploy).mockClear()
      vi.mocked(api.projects.deploy)
        .mockRejectedValue(new ValidationError({ statusCode: 400, error: 'Bad Request', message }))
      const ctx = createCommandContext({ plan: false, force: true })

      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

      expect(api.projects.deploy).toHaveBeenCalledOnce()
    }
  })

  it('keeps a second failure that is not a refusal, and retries a plan-less run without the flag', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    const refusal = new ValidationError({ statusCode: 400, error: 'Bad Request', message: '"sourceFile" is not allowed' })
    const conflict = new ConflictError({ statusCode: 409, error: 'Conflict', message: 'in progress' })
    vi.mocked(api.projects.deploy).mockRejectedValueOnce(refusal).mockRejectedValueOnce(conflict)
    const ctx = createCommandContext({ plan: false, force: true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    expect(ctx.style.longError).toHaveBeenCalledWith(expect.stringContaining('in progress'), expect.anything())

    // A preview that failed for a reason other than a missing endpoint leaves
    // the run equally unsure of the API, so it gets the same retry.
    vi.mocked(api.projects.deploy).mockClear()
    vi.mocked(api.projects.preview).mockRejectedValue(new Error('gateway timeout'))
    vi.mocked(api.projects.deploy)
      .mockRejectedValueOnce(refusal)
      .mockResolvedValueOnce({ data: { project: {} as any, diff: [] } })
    const unplanned = createCommandContext({ force: true })
    await Deploy.prototype.run.call(unplanned as any)
    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    expect(unplanned.style.longWarning).toHaveBeenCalledWith(
      expect.stringContaining('does not know the fields the preview endpoint added'),
      expect.any(String),
    )
  })

  it('warns after the deploy, not before a prompt, when the dry run already fell back', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)
    declareProjectIn(repoRoot)
    vi.mocked(api.projects.deploy)
      .mockRejectedValueOnce(new ValidationError({ statusCode: 400, error: 'Bad Request', message: '"sourceFile" is not allowed' }))
      .mockResolvedValue({ data: { project: {} as any, diff: [] } })
    const ctx = createCommandContext({ plan: false })

    await Deploy.prototype.run.call(ctx as any)

    // Dry run, its retry, then the confirmed deploy already in the older form.
    expect(api.projects.deploy).toHaveBeenCalledTimes(3)
    expect(vi.mocked(api.projects.deploy).mock.calls[2][0].resources[0]).not.toHaveProperty('sourceFile')
    expect(ctx.style.longWarning).toHaveBeenCalledOnce()
    expect(vi.mocked(ctx.style.longWarning).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(prompts).mock.invocationCallOrder[0])
  })

  it('does not retry a planned deploy', async () => {
    planResolves()
    vi.mocked(api.projects.deploy)
      .mockRejectedValue(new ValidationError({ statusCode: 400, error: 'Bad Request', message: '"sourceFile" is not allowed' }))
    const ctx = createCommandContext({ force: true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('is the default, and --no-plan says so', async () => {
    const parse = async (argv: string[]) =>
      (await Parser.parse(argv, { flags: Deploy.flags, strict: true })).flags.plan

    expect(await parse([])).toBe(false)
    expect(await parse(['--no-plan'])).toBe(false)
    expect(await parse(['--plan'])).toBe(true)
  })

  it('echoes no plan flag in the command that confirms it', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({ plan: false })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.confirmCommand).toBe('npx checkly deploy --force')
    expect(output).not.toHaveProperty('preview')
  })

  it('sends no plan to the deploy, which then writes every resource', async () => {
    const ctx = createCommandContext({ plan: false, force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ plan: false })
  })

  it('refuses what only a plan can deliver, before doing anything', async () => {
    for (const [flags, named] of [
      [{ 'plan-token': PLAN_TOKEN }, '--plan-token'],
      [{ 'prune-relations': true }, '--prune-relations'],
    ] as const) {
      vi.mocked(parseProject).mockClear()
      const ctx = createCommandContext({ plan: false, force: true, ...flags })

      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

      expect(ctx.style.longError).toHaveBeenCalledWith(
        `${named} applies to a planned deploy only.`,
        `Re-run with --plan, or without ${named}.`,
      )
      expect(parseProject).not.toHaveBeenCalled()
      expect(api.projects.preview).not.toHaveBeenCalled()
      expect(api.projects.deploy).not.toHaveBeenCalled()
    }
  })
})

describe('deploy confirmCommand', () => {
  it('echoes only the flags the user typed', async () => {
    expect(await confirmCommandFor([])).toBe('npx checkly deploy --force')
    expect(await confirmCommandFor(['--preserve-resources'])).toBe('npx checkly deploy --preserve-resources --force')
  })

  it('keeps an explicit --no-<flag> for flags that allow it', async () => {
    expect(await confirmCommandFor(['--no-schedule-on-deploy']))
      .toBe('npx checkly deploy --no-schedule-on-deploy --force')
  })

  it('generates a command oclif can parse back', async () => {
    const argvs = [
      [],
      ['--preserve-resources'],
      ['--no-schedule-on-deploy'],
      ['--schedule-on-deploy-threshold', '20'],
      ['--schedule-on-deploy-min-frequency', '0'],
      ['--verbose'],
      ['--plan'],
      ['--no-plan'],
      ['--plan', '--prune-relations'],
      ['--plan', '--plan-token', PLAN_TOKEN],
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

describe('deploy write-back from a terminal', () => {
  const SOURCE = `import { ApiCheck } from 'checkly/constructs'

new ApiCheck('api', {
  name: 'API',
  request: { url: 'https://example.com', method: 'GET' },
})
`
  const remoteEdit: DiffEntry = {
    type: 'check',
    logicalId: 'api',
    physicalId: 'a1',
    action: 'UPDATE',
    changes: [
      { path: '/name', origin: 'remote', before: 'API', after: 'API renamed' },
      { path: '/frequency', origin: 'remote', before: 10, after: 5 },
    ],
    before: { id: 'a1', checkType: 'API', name: 'API renamed', frequency: 5, request: { url: 'https://example.com', method: 'GET' } },
    redactions: [],
  }
  let dir: string

  /** The project with an API check declared in a real file, so the write-back has something to edit. */
  async function declareProjectWithFile () {
    Session.reset()
    Session.workspace = Ok({} as any)
    const project = new Project('my-project', { name: 'My Project' })
    Session.project = project
    const file = path.join(dir, 'api.check.ts')
    await fs.writeFile(file, SOURCE, 'utf8')
    Session.checkFileAbsolutePath = file
    new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    Session.checkFileAbsolutePath = undefined
    vi.mocked(parseProject).mockResolvedValue(project)
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    storeBundle.mockResolvedValue({ key: 'stored-bundle-key' })
    vi.mocked(api.projects.deploy).mockResolvedValue({ data: { project: {} as any, diff: [] } })
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-write-back-')))
    await declareProjectWithFile()
  })

  afterEach(async () => {
    Session.reset()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('offers to update the code when a resource was edited in Checkly, and does so instead of deploying', async () => {
    planResolves([remoteEdit])
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
    const ctx = createCommandContext()

    try {
      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')
    } finally {
      spy.mockRestore()
    }

    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({
      type: 'select',
      choices: [
        { value: 'apply' },
        { title: 'Update my code with the changes made in Checkly (deploys nothing)', value: 'alternative:0' },
        { value: 'cancel' },
      ],
    })
    expect(await fs.readFile(path.join(dir, 'api.check.ts'), 'utf8')).toBe(`import { ApiCheck, Frequency } from 'checkly/constructs'

new ApiCheck('api', {
  name: 'API renamed',
  request: { url: 'https://example.com', method: 'GET' },
  frequency: Frequency.EVERY_5M,
})
`)
    const printed = ctx.logged.join('\n')
    // The construct's source as it was against as it is now, under the header
    // the plan gave the resource. A property the code does not set is added
    // the way `checkly import` spells it, and the helper it needs is imported.
    expect(printed).toContain([
      'Updated your code · 2 properties in 1 file',
      '',
      '~ ApiCheck api  api.check.ts',
      '    new ApiCheck(\'api\', {',
      '  -   name: \'API\',',
      '  +   name: \'API renamed\',',
      '      request: { url: \'https://example.com\', method: \'GET\' },',
      '  +   frequency: Frequency.EVERY_5M,',
      '    })',
      '  ~ imported Frequency from \'checkly/constructs\'',
      '',
    ].join('\n'))
    expect(printed).toContain('Nothing was deployed. Review with `git diff`, then run `npx checkly deploy --plan` again.')
    expect(storeBundle).not.toHaveBeenCalled()
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('does not offer the choice when no remote change could be written', async () => {
    planResolves([{
      ...remoteEdit,
      changes: [
        { path: '/script', origin: 'remote', before: 'a', after: 'b' },
        // A check moved to the global alert policy has nothing to write either.
        { path: '/useGlobalAlertSettings', origin: 'remote', before: false, after: true },
      ],
      before: { ...remoteEdit.before, useGlobalAlertSettings: true },
    }])
    vi.mocked(prompts).mockResolvedValue({ confirm: false })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ type: 'confirm' })
    expect(await fs.readFile(path.join(dir, 'api.check.ts'), 'utf8')).toBe(SOURCE)
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('does not offer the choice for a change the table refuses, or for a secret', async () => {
    planResolves([
      {
        ...CHANGED,
        redactions: [],
        changes: [{ path: '/type', origin: 'remote', before: 'EMAIL', after: 'SLACK' }],
      },
      {
        ...remoteEdit,
        changes: [{ path: '/environmentVariables', origin: 'remote', secret: true, after: [{ key: 'K', value: { $masked: 'changed' } }] }],
      },
    ])
    vi.mocked(prompts).mockResolvedValue({ confirm: false })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ type: 'confirm' })
  })

  it('lists what it could not update and changes nothing when nothing applies after all', async () => {
    // A writable path that turns out unwritable only once the file is read.
    await fs.writeFile(path.join(dir, 'api.check.ts'), SOURCE.replace('name: \'API\'', 'name: title'), 'utf8')
    planResolves([{ ...remoteEdit, changes: [remoteEdit.changes![0]] }])
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('Not updated · edit these by hand\n\n! ApiCheck api  ')
    expect(printed).toContain('\n    name  name is the variable title, not a plain literal\n')
    expect(printed).toContain('Nothing in the code could be updated automatically, so nothing was changed.')
    expect(applyWriteBack).not.toHaveBeenCalled()
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('reports a write that fails as an error, after listing nothing as updated', async () => {
    planResolves([remoteEdit])
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    vi.mocked(applyWriteBack).mockRejectedValueOnce(new Error('Could not write api.check.ts: EACCES. No file was changed.'))
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(ctx.style.longError).toHaveBeenCalledWith('Could not update your code.', 'Could not write api.check.ts: EACCES. No file was changed.')
    expect(ctx.logged.join('\n')).not.toContain('Updated')
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  // A check moved to another group in Checkly: a reference, which is refused.
  const withRefusedChange: DiffEntry = {
    ...remoteEdit,
    changes: [...remoteEdit.changes!, { path: '/groupId', origin: 'remote', before: 1, after: 2 }],
  }

  it('lists what it could not update under what it updated', async () => {
    planResolves([withRefusedChange])
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    const printed = ctx.logged.join('\n')
    const updated = printed.indexOf('Updated your code · 2 properties in 1 file')
    const notUpdated = printed.indexOf('Not updated · edit these by hand')
    expect(updated).toBeGreaterThan(-1)
    expect(notUpdated).toBeGreaterThan(updated)
    // The path Checkly reports is shown the way the code names the property.
    expect(printed).toContain('\n    groupId  references another resource\n')
    expect(printed.indexOf('Nothing was deployed.')).toBeGreaterThan(notUpdated)
  })

  it('still lists what has to be edited by hand when the write fails', async () => {
    planResolves([withRefusedChange])
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    vi.mocked(applyWriteBack).mockRejectedValueOnce(new Error('Could not write api.check.ts: EACCES. No file was changed.'))
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('Not updated · edit these by hand')
    expect(printed).not.toContain('Updated your code')
  })

  it('asks the plain yes/no question when nothing was edited in Checkly', async () => {
    planResolves([{ ...CHANGED, redactions: [] }])
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ type: 'confirm', message: 'Apply these changes?' })
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('applies the plan when the user chooses to', async () => {
    planResolves([remoteEdit])
    vi.mocked(prompts).mockResolvedValue({ action: 'apply' })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(await fs.readFile(path.join(dir, 'api.check.ts'), 'utf8')).toBe(SOURCE)
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('never prompts a forced run', async () => {
    planResolves([remoteEdit])
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(prompts).not.toHaveBeenCalled()
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })
})

describe('deploy of a plan with nothing to apply', () => {
  const UNCHANGED_CHANNEL: DiffEntry = { type: 'alert-channel', logicalId: 'ops', physicalId: 42, action: 'UNCHANGED' }
  const UNCHANGED_CHECK: DiffEntry = { type: 'check', logicalId: 'api', physicalId: 'a1', action: 'UNCHANGED' }

  /** The project every other test deploys, with a check next to its alert channel. */
  function declareProjectWithCheck () {
    const project = declareProject()
    new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    return project
  }

  function nothingToApply (diff: DiffEntry[] = [UNCHANGED_CHANNEL]) {
    planResolves(diff)
    vi.mocked(api.projects.deploy).mockResolvedValue({ data: { project: {} as any, diff } })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    storeBundle.mockResolvedValue({ key: 'stored-bundle-key' })
    declareProject()
    nothingToApply()
  })

  afterEach(() => {
    Session.reset()
  })

  it('asks nobody in a terminal: says so, then records the deployment', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(prompts).not.toHaveBeenCalled()
    const printed = ctx.logged.join('\n')
    expect(printed).toContain('No changes. The 1 resource in account "Test Account" matches your code.')
    expect(printed).not.toContain('Deploy preview')
    expect(printed).not.toContain('This will:')
    expect(printed).not.toContain('--plan-token')

    // The deploy is still sent, pinned to the plan that said so.
    expect(storeBundle).toHaveBeenCalledOnce()
    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ plan: true, planToken: PLAN_TOKEN })
    expect(ctx.style.actionStart).toHaveBeenCalledWith('Recording the deployment')
    expect(ctx.style.actionStart).not.toHaveBeenCalledWith('Deploying project')
    // A project without checks has nothing to schedule, so nothing is claimed.
    expect(ctx.logged[ctx.logged.length - 1]).toBe('Project "My Project" is up to date.')
  })

  it('hands an agent or CI run no confirmation envelope', async () => {
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.exit).not.toHaveBeenCalled()
    expect(ctx.logged.join('\n')).not.toContain('confirmation_required')
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('says the same to a forced run', async () => {
    const ctx = createCommandContext({ force: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.join('\n')).toContain('No changes.')
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('says whether the checks were scheduled', async () => {
    declareProjectWithCheck()
    nothingToApply([UNCHANGED_CHANNEL, UNCHANGED_CHECK])
    const scheduling = createCommandContext()
    await Deploy.prototype.run.call(scheduling as any)
    expect(scheduling.logged[scheduling.logged.length - 1])
      .toBe('Project "My Project" is up to date. Checks were scheduled to run.')

    declareProjectWithCheck()
    const notScheduling = createCommandContext({ 'schedule-on-deploy': false })
    await Deploy.prototype.run.call(notScheduling as any)
    expect(notScheduling.logged[notScheduling.logged.length - 1]).toBe('Project "My Project" is up to date.')
  })

  describe('scheduling threshold', () => {
    it('sends a threshold the user set, and echoes it in the confirm command', async () => {
      nothingToApply([{ ...UNCHANGED_CHANNEL, action: 'UPDATE', basis: 'live' }])
      const asked = createCommandContext({ 'schedule-on-deploy-threshold': 20 })
      await expect(Deploy.prototype.run.call(asked as any)).rejects.toThrow('EXIT_2')
      const output = JSON.parse(asked.logged[asked.logged.length - 1])
      // The confirmation does not go into the threshold; the deploy reports it.
      expect(output.changes).toContain('Schedule checks after deploy')
      expect(output.confirmCommand).toContain('--schedule-on-deploy-threshold="20"')

      const forced = createCommandContext({ 'force': true, 'schedule-on-deploy-threshold': 20 })
      await Deploy.prototype.run.call(forced as any)
      expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ scheduleOnDeployThreshold: 20 })
    })

    it('sends no threshold when the user left it to Checkly', async () => {
      await Deploy.prototype.run.call(createCommandContext() as any)
      expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ scheduleOnDeployThreshold: undefined })
    })

    it('warns when Checkly did not schedule the checks', async () => {
      declareProjectWithCheck()
      planResolves([UNCHANGED_CHANNEL, UNCHANGED_CHECK])
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: { project: {} as any, diff: [UNCHANGED_CHANNEL, UNCHANGED_CHECK], scheduled: false },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      // A blank line sets the warning apart from the line before it.
      expect(ctx.logged[ctx.logged.length - 1]).toBe('Project "My Project" is up to date.')
      // The last thing logged is the blank line before the warning or notice.
      expect(vi.mocked(ctx.log).mock.calls.at(-1)).toEqual([])
      expect(ctx.style.longWarning).toHaveBeenCalledTimes(1)
      const [title, message] = vi.mocked(ctx.style.longWarning).mock.calls[0]
      expect(title).toBe('Checks were not scheduled')
      expect(message).toMatch(/^This deploy would have scheduled more checks than the scheduling threshold allows\.\n/)
      for (const option of [
        '--no-schedule-on-deploy',
        '--schedule-on-deploy-threshold=<number>',
        '--schedule-on-deploy-min-frequency=<number>',
      ]) {
        expect(message).toContain(`\n  ${option}\n`)
      }
    })

    it('does not warn when the user asked for no scheduling', async () => {
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: { project: {} as any, diff: [UNCHANGED_CHANNEL], scheduled: false },
      })
      const ctx = createCommandContext({ 'schedule-on-deploy': false })

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.style.longWarning).not.toHaveBeenCalled()
    })
  })

  describe('scheduling minimum frequency', () => {
    it('sends a minimum the user set and keeps the confirmation plain', async () => {
      nothingToApply([{ ...UNCHANGED_CHANNEL, action: 'UPDATE', basis: 'live' }])
      const asked = createCommandContext({ 'schedule-on-deploy-min-frequency': 15 })
      await expect(Deploy.prototype.run.call(asked as any)).rejects.toThrow('EXIT_2')
      const output = JSON.parse(asked.logged[asked.logged.length - 1])
      expect(output.changes).toContain('Schedule checks after deploy')
      expect(output.confirmCommand).toContain('--schedule-on-deploy-min-frequency="15"')

      const forced = createCommandContext({ 'force': true, 'schedule-on-deploy-min-frequency': 15 })
      await Deploy.prototype.run.call(forced as any)
      expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ scheduleOnDeployMinFrequency: 15 })
    })

    it('sends no minimum when the user left it to Checkly', async () => {
      await Deploy.prototype.run.call(createCommandContext() as any)
      expect(vi.mocked(api.projects.deploy).mock.calls[0][1]).toMatchObject({ scheduleOnDeployMinFrequency: undefined })
    })

    // What the deploy marks on its checks, the way Checkly reports it.
    const marked = (scheduled: boolean, scheduleSkippedReason?: DiffEntry['scheduleSkippedReason']) =>
      ({ ...UNCHANGED_CHECK, scheduled, ...scheduleSkippedReason ? { scheduleSkippedReason } : {} })

    it('says the checks were scheduled when Checkly scheduled any of them', async () => {
      declareProjectWithCheck()
      planResolves([UNCHANGED_CHANNEL, UNCHANGED_CHECK])
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: {
          project: {} as any,
          diff: [UNCHANGED_CHANNEL, marked(true), { ...marked(false, 'MIN_FREQUENCY'), logicalId: 'frequent' }],
        },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.logged[ctx.logged.length - 1]).toBe('Project "My Project" is up to date. Checks were scheduled to run.')
      // The last thing logged is the blank line before the warning or notice.
      expect(vi.mocked(ctx.log).mock.calls.at(-1)).toEqual([])
      expect(ctx.style.longInfo).toHaveBeenCalledWith(
        'Some checks were not scheduled',
        'The checks will run at their next scheduled time.\n'
        + '\n'
        + 'Not scheduled:\n'
        + '- 1 check that runs more often than the minimum frequency allows.',
      )
    })

    it('does not say the checks were scheduled when the minimum left out every one', async () => {
      declareProjectWithCheck()
      planResolves([UNCHANGED_CHANNEL, UNCHANGED_CHECK])
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: {
          project: {} as any,
          diff: [
            UNCHANGED_CHANNEL,
            marked(false, 'MIN_FREQUENCY'),
            { ...marked(false, 'MIN_FREQUENCY'), logicalId: 'frequent' },
          ],
        },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.logged[ctx.logged.length - 1]).toBe('Project "My Project" is up to date.')
      // The last thing logged is the blank line before the warning or notice.
      expect(vi.mocked(ctx.log).mock.calls.at(-1)).toEqual([])
      expect(ctx.style.longInfo).toHaveBeenCalledWith(
        'Some checks were not scheduled',
        expect.stringContaining('\n- 2 checks that run more often than the minimum frequency allows.'),
      )
    })

    it('says nothing about the minimum when it left no check out', async () => {
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: { project: {} as any, diff: [UNCHANGED_CHANNEL, marked(true)] },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.style.longInfo).not.toHaveBeenCalled()
    })

    it('only warns about a deploy the threshold stopped, whatever else left checks out', async () => {
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: {
          project: {} as any,
          diff: [UNCHANGED_CHANNEL, marked(false, 'THRESHOLD'), { ...marked(false, 'MIN_FREQUENCY'), logicalId: 'often' }],
          scheduled: false,
        },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.style.longWarning).toHaveBeenCalledTimes(1)
      expect(ctx.style.longInfo).not.toHaveBeenCalled()
    })

    it('lists a reason it does not know yet as another reason', async () => {
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: {
          project: {} as any,
          diff: [UNCHANGED_CHANNEL, marked(true), { ...marked(false, 'MOON_PHASE' as any), logicalId: 'moon' }],
        },
      })
      const ctx = createCommandContext()

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.style.longInfo).toHaveBeenCalledWith(
        'Some checks were not scheduled',
        expect.stringContaining('\n- 1 check for another reason (MOON_PHASE).'),
      )
    })

    it('says nothing about checks left out when the deploy asked for no scheduling', async () => {
      vi.mocked(api.projects.deploy).mockResolvedValue({
        data: { project: {} as any, diff: [UNCHANGED_CHANNEL, marked(false, 'NOT_REQUESTED')], scheduled: false },
      })
      const ctx = createCommandContext({ 'schedule-on-deploy': false })

      await Deploy.prototype.run.call(ctx as any)

      expect(ctx.style.longInfo).not.toHaveBeenCalled()
      expect(ctx.style.longWarning).not.toHaveBeenCalled()
    })
  })

  it('still warns about relations the project does not manage, without asking', async () => {
    nothingToApply([{
      type: 'check',
      logicalId: 'chk',
      physicalId: 1,
      action: 'UNCHANGED',
      changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
    }])
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toMatch(/^ {2}! Check {2}chk {2}has alert channels or private locations this project does not/m)
    expect(printed).toContain('No changes. The 1 resource in account "Test Account" matches your code.')
    expect(api.projects.deploy).toHaveBeenCalledOnce()
  })

  it('prints the sentence and no token under --preview, and deploys nothing', async () => {
    const ctx = createCommandContext({ preview: true })

    await Deploy.prototype.run.call(ctx as any)

    const printed = ctx.logged.join('\n')
    expect(printed).toContain('No changes.')
    expect(printed).not.toContain('--plan-token')
    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(storeBundle).not.toHaveBeenCalled()
  })

  it('keeps the dry_run envelope, token included', async () => {
    const ctx = createCommandContext({ 'dry-run': true })

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
    expect(output.status).toBe('dry_run')
    expect(output.preview.planToken).toBe(PLAN_TOKEN)
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('prints no overview of nothing after the deploy under --output', async () => {
    const ctx = createCommandContext({ output: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.join('\n')).not.toContain('unchanged')
  })

  it('reports a deploy that wrote something after all as a deploy', async () => {
    // A forced run plans again when the account moved under it, and deploys
    // whatever the new plan holds.
    vi.mocked(api.projects.preview)
      .mockResolvedValueOnce({ planToken: PLAN_TOKEN, diff: [UNCHANGED_CHANNEL] })
      .mockResolvedValueOnce({ planToken: 'v1.BBBBBBBBBBBBBBBBBBBBBB', diff: [CHANGED] })
    vi.mocked(api.projects.deploy)
      .mockRejectedValueOnce(new ProjectPlanStaleError('The project changed since the preview.', []))
      .mockResolvedValueOnce({ data: { project: {} as any, diff: [CHANGED] } })
    const ctx = createCommandContext({ force: true, output: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.deploy).toHaveBeenCalledTimes(2)
    const printed = ctx.logged.join('\n')
    expect(printed).toContain('1 updated')
    expect(ctx.logged[ctx.logged.length - 1])
      .toBe('Successfully deployed project "My Project" to account "Test Account".')
  })

  it('refuses, in words that claim no confirmation, when the account moves before the deploy lands', async () => {
    // Nobody confirmed this plan, but it was shown, so it is not replaced by
    // another one behind the user's back.
    vi.mocked(api.projects.deploy).mockRejectedValue(
      new ProjectPlanStaleError('The project changed since the preview.', [CHANGED]),
    )
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(api.projects.deploy).toHaveBeenCalledOnce()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Your Checkly account changed after the plan found no changes, so nothing was deployed.',
      expect.any(String),
    )
  })

  it('claims no scheduling for a project whose only checks are never deployed', async () => {
    declareProject()
    new ApiCheck('smoke', { name: 'Smoke', testOnly: true, request: { url: 'https://example.com', method: 'GET' } })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged[ctx.logged.length - 1]).toBe('Project "My Project" is up to date.')
  })

  it('still asks when the plan could not be made', async () => {
    // Without a plan nothing says there are no changes: the fallback lists
    // every existing resource as an update, and the confirmation stands.
    vi.mocked(api.projects.preview).mockRejectedValue(new Error('boom'))
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')
  })

  describe('when the plan sets the baseline', () => {
    // No earlier planned deploy to compare with: the deploy writes each of
    // them whatever was found, so a plan with no difference is still a write.
    const SETS_BASELINE: DiffEntry = { ...UNCHANGED_CHANNEL, action: 'UPDATE', basis: 'live' }

    it('asks for confirmation, listing the resource as an update', async () => {
      nothingToApply([SETS_BASELINE])
      const ctx = createCommandContext()

      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      const output = JSON.parse(ctx.logged[ctx.logged.length - 1])
      expect(output.status).toBe('confirmation_required')
      expect(output.changes).toContain('Update AlertChannel: ops')
      expect(output.preview.diff).toEqual([SETS_BASELINE])
      expect(api.projects.deploy).not.toHaveBeenCalled()
    })

    it('asks as well when the only thing reported on one is a relation the project does not manage', async () => {
      declareProjectWithCheck()
      nothingToApply([{
        ...UNCHANGED_CHECK,
        action: 'UPDATE',
        basis: 'live',
        changes: [{ path: '/alertChannels/7', origin: 'unmanaged', before: { ref: 'ops' } }],
      }])
      const ctx = createCommandContext()

      await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')
    })

    it('reports the deploy as one that wrote, with the note, under --output', async () => {
      nothingToApply([SETS_BASELINE])
      const ctx = createCommandContext({ force: true, output: true })

      await Deploy.prototype.run.call(ctx as any)

      const printed = ctx.logged.join('\n')
      expect(printed).not.toContain('No changes.')
      expect(printed).toContain('\n1 updated, 0 unchanged\n')
      expect(printed).toContain(
        '1 resource was updated to set a baseline for --plan. Later deploys with --plan show only what changed.',
      )
      expect(ctx.logged[ctx.logged.length - 1])
        .toBe('Successfully deployed project "My Project" to account "Test Account".')
    })
  })
})
