import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
  projects: { preview: vi.fn(), deploy: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
  heartbeatCheck: { get: vi.fn() },
}))

vi.mock('../../services/checkly-config-loader', async () => {
  const { Diagnostics } = await import('../../constructs/diagnostics.js')
  return {
    loadChecklyConfig: vi.fn().mockResolvedValue({
      config: { logicalId: 'my-project', projectName: 'My Project', checks: {} },
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

vi.mock('../../services/check-parser/bundler', () => ({
  Bundler: {
    createForWorkspace: vi.fn().mockResolvedValue({
      isEmpty: true,
      marker: 'code-bundle',
      codeBundleSha256: 'sha256',
      cacheHash: 'cache-hash',
      registerFiles: vi.fn(),
      updateMarker: vi.fn(),
      finalize: vi.fn().mockResolvedValue({ archiveFile: 'bundle.tgz', store: vi.fn() }),
    }),
  },
}))

import * as api from '../../rest/api.js'
import { ValidationError } from '../../rest/errors.js'
import type { DiffEntry } from '../../rest/projects.js'
import { parseProject } from '../../services/project-parser.js'
import { Ok } from '../../services/check-parser/package-files/result.js'
import { PlaywrightProjectBundle, PlaywrightProjectBundler } from '../../services/playwright-project-bundler.js'
import { Engine } from '../../constructs/engine.js'
import { PlaywrightCheck } from '../../constructs/playwright-check.js'
import { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import Deploy from '../deploy.js'
import { createCommandContext as createSharedCommandContext } from './helpers/command-context.js'

class StubPlaywrightProjectBundler extends PlaywrightProjectBundler {
  // eslint-disable-next-line require-await
  protected async bundleProject (): Promise<PlaywrightProjectBundle> {
    return { browsers: ['chromium'], relativePlaywrightConfigPath: 'playwright.config.mjs', playwrightVersion: '1.59.1', files: [] }
  }
}

const FLAGS = {
  'force': true,
  'preview': false,
  'dry-run': false,
  'plan': true,
  'plan-token': undefined,
  'prune-unmanaged-relations': false,
  'fail-on-drift': false,
  'preserve-resources': false,
  'cancel-in-progress-deployment': false,
  'output': false,
  'verbose': false,
  'config': undefined,
  'schedule-on-deploy': false,
  'schedule-on-deploy-scope': 'changed',
  'schedule-on-deploy-threshold': 'auto',
  'schedule-on-deploy-min-frequency': 'auto',
  'verify-runtime-dependencies': true,
  'debug-bundle': false,
  'debug-bundle-output-file': './debug-bundle.json',
}

function createCommandContext (flags: Record<string, unknown> = {}) {
  return createSharedCommandContext({
    command: Deploy,
    parsed: {
      flags: { ...FLAGS, ...flags },
      metadata: {
        flags: Object.fromEntries(
          ['schedule-on-deploy-scope', 'schedule-on-deploy-threshold', 'schedule-on-deploy-min-frequency']
            .map(name => [name, { setFromDefault: true }]),
        ),
      },
    },
    members: { account: { name: 'Test Account', runtimeId: 'runtime-default' } },
  })
}

const PLAN_TOKEN = 'v1.AAAAAAAAAAAAAAAAAAAAAA'

const REFUSAL = 'Check \'pinned\': No available Node.js release satisfies 27. The newest available release is 26.13.0.'

function checkEntry (logicalId: string, resolvedNodeVersion?: string | null, action = 'UNCHANGED'): DiffEntry {
  return {
    type: 'check',
    logicalId,
    action,
    ...resolvedNodeVersion !== undefined ? { resolvedNodeVersion } : {},
  }
}

describe('deploy Node.js version lines', () => {
  let dir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-node-versions-')))
    await fs.writeFile(path.join(dir, 'playwright.config.mjs'), 'export default {}\n')
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      devEngines: { runtime: [{ name: 'bun', version: '1.3.0' }, { name: 'node', version: '^26.13.0' }] },
    }))

    Session.reset()
    Session.workspace = Ok({ lockfile: Ok(path.join(dir, 'package-lock.json')) } as any)
    Session.basePath = dir
    Session.contextPath = dir
    Session.checkFilesDirectory = dir
    Session.playwrightProjectBundler = new StubPlaywrightProjectBundler()
    const project = new Project('my-project', { name: 'My Project' })
    Session.project = project
    const declare = (file: string, logicalId: string, engine?: Engine) => {
      Session.checkFileAbsolutePath = path.join(dir, '__checks__', file)
      new PlaywrightCheck(logicalId, { name: logicalId, playwrightConfigPath: '../playwright.config.mjs', engine })
      Session.checkFileAbsolutePath = undefined
    }
    declare('detected.check.ts', 'detected')
    declare('detected.check.ts', 'also-detected')
    declare('pinned.check.ts', 'pinned', Engine.node('24.11.0'))
    declare('bun.check.ts', 'bun', Engine.bun('1.4'))
    vi.mocked(parseProject).mockResolvedValue(project)
  })

  afterEach(async () => {
    Session.reset()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('prints one line per request, source and release after the deploy\'s result, on stdout', async () => {
    vi.mocked(api.projects.preview).mockResolvedValue({ planToken: PLAN_TOKEN, diff: [] })
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: {
        project: {} as any,
        diff: [
          checkEntry('detected', '26.13.0', 'UPDATE'),
          checkEntry('also-detected', '26.13.0', 'UPDATE'),
          checkEntry('pinned', '24.11.0', 'UPDATE'),
          checkEntry('bun', null, 'UPDATE'),
        ],
      },
    })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.slice(-3)).toEqual([
      'Successfully deployed project "My Project" to account "Test Account".',
      'Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.',
      'Node.js 24.11.0 (Engine.node() in __checks__/pinned.check.ts) runs 24.11.0.',
    ])
    expect(ctx.loggedToStderr.join('\n')).not.toContain('Node.js')
    // The payload carries the request as written, and never its source.
    const [payload] = vi.mocked(api.projects.deploy).mock.calls[0]
    const pinned = payload.resources.find(resource => resource.logicalId === 'pinned')
    expect(pinned?.payload).toMatchObject({ engine: 'node', engineVersion: '24.11.0' })
    expect(JSON.stringify(payload)).not.toContain('devEngines.runtime')
  })

  it('prints the lines without a release when the deploy\'s result has none', async () => {
    vi.mocked(api.projects.preview).mockResolvedValue({ planToken: PLAN_TOKEN, diff: [] })
    vi.mocked(api.projects.deploy).mockResolvedValue({
      data: { project: {} as any, diff: [checkEntry('detected'), checkEntry('also-detected', null)] },
    })
    const ctx = createCommandContext()

    await Deploy.prototype.run.call(ctx as any)

    expect(ctx.logged.slice(-2)).toEqual([
      'Node.js ^26.13.0 (package.json devEngines.runtime).',
      'Node.js 24.11.0 (Engine.node() in __checks__/pinned.check.ts).',
    ])
  })

  it('prints the lines after the preview, from the plan', async () => {
    vi.mocked(api.projects.preview).mockResolvedValue({
      planToken: PLAN_TOKEN,
      diff: [checkEntry('detected', '26.13.0'), checkEntry('also-detected', '26.14.0'), checkEntry('pinned', '24.11.0')],
    })
    const ctx = createCommandContext({ force: false, preview: true })

    await Deploy.prototype.run.call(ctx as any)

    expect(api.projects.deploy).not.toHaveBeenCalled()
    expect(ctx.logged.slice(-3)).toEqual([
      'Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.13.0.',
      'Node.js ^26.13.0 (package.json devEngines.runtime) runs 26.14.0.',
      'Node.js 24.11.0 (Engine.node() in __checks__/pinned.check.ts) runs 24.11.0.',
    ])
  })

  it.each([
    ['a dry run', { 'dry-run': true }, 'EXIT_0'],
    ['the agent confirmation', { force: false }, 'EXIT_3'],
  ])('leaves the plan in %s as Checkly sent it, without the lines', async (_, flags, exit) => {
    const plan = [checkEntry('pinned', '24.11.0', 'UPDATE')]
    vi.mocked(api.projects.preview).mockResolvedValue({ planToken: PLAN_TOKEN, diff: plan })
    const ctx = createCommandContext(flags)

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow(exit)

    expect(ctx.logged).toHaveLength(1)
    expect(JSON.parse(ctx.logged[0]).preview.diff).toEqual(plan)
  })

  it.each([
    ['deploy', {}],
    ['deploy --preview', { force: false, preview: true }],
  ])('reports a refused Node.js version in Checkly\'s words on %s, without falling back', async (_, flags) => {
    const refusal = new ValidationError({ statusCode: 400, error: 'Bad Request', message: REFUSAL })
    vi.mocked(api.projects.preview).mockRejectedValue(refusal)
    const ctx = createCommandContext(flags)

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(ctx.style.longError).toHaveBeenCalledWith('Your project could not be deployed.', refusal)
    expect(ctx.style.longWarning).not.toHaveBeenCalled()
    expect(api.projects.deploy).not.toHaveBeenCalled()
  })

  it('reports a deploy that Checkly refuses in its own words', async () => {
    const refusal = new ValidationError({ statusCode: 400, error: 'Bad Request', message: REFUSAL })
    vi.mocked(api.projects.preview).mockResolvedValue({ planToken: PLAN_TOKEN, diff: [] })
    vi.mocked(api.projects.deploy).mockRejectedValue(refusal)
    const ctx = createCommandContext()

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(ctx.style.longError).toHaveBeenCalledWith('Your project could not be deployed.', refusal)
  })
})
