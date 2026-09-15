import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
  projects: {
    // A deploy previews first and sends what it previewed, so both calls see
    // the same synthesized resources.
    preview: vi.fn().mockResolvedValue({ planToken: 'v1.AAAAAAAAAAAAAAAAAAAAAA', diff: [] }),
    deploy: vi.fn().mockResolvedValue({ data: { diff: [] } }),
  },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('../../services/checkly-config-loader', async () => {
  const { Diagnostics } = await import('../../constructs/diagnostics.js')
  return {
    loadChecklyConfig: vi.fn().mockResolvedValue({
      config: {
        logicalId: 'my-project',
        projectName: 'My Project',
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

vi.mock('../../services/check-parser/bundler', () => ({
  Bundler: {
    createForWorkspace: vi.fn().mockResolvedValue({
      isEmpty: true,
      updateMarker: vi.fn(),
      finalize: vi.fn().mockResolvedValue({ archiveFile: 'bundle.tgz', store: vi.fn() }),
    }),
  },
}))

import * as api from '../../rest/api.js'
import { parseProject } from '../../services/project-parser.js'
import { getGitInformation, getGitRepoRoot } from '../../services/util.js'
import { Ok } from '../../services/check-parser/package-files/result.js'
import { EmailAlertChannel } from '../../constructs/email-alert-channel.js'
import { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import { AuthCommand } from '../authCommand.js'
import Deploy from '../deploy.js'

const repoRoot = path.resolve('/home/user/repo')

function createCommandContext () {
  return {
    parse: vi.fn().mockResolvedValue({
      flags: {
        'force': true,
        'preview': false,
        'dry-run': false,
        'plan-token': undefined,
        'prune-relations': false,
        'preserve-resources': false,
        'cancel-in-progress-deployment': false,
        'output': false,
        'verbose': false,
        'config': undefined,
        'schedule-on-deploy': true,
        'verify-runtime-dependencies': true,
        'debug-bundle': false,
        'debug-bundle-output-file': './debug-bundle.json',
      },
      metadata: { flags: {} },
    }),
    log: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`EXIT_${code}`)
    }),
    style: {
      outputFormat: undefined,
      diagnostics: vi.fn(),
      actionStart: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      actionStatus: vi.fn(),
      longError: vi.fn(),
      longWarning: vi.fn(),
      longInfo: vi.fn(),
      shortError: vi.fn(),
    },
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    validateProject: (AuthCommand.prototype as any).validateProject,
    formatPreview: (Deploy.prototype as any).formatPreview,
    constructor: Deploy,
    account: { name: 'Test Account', runtimeId: 'runtime-default' },
  }
}

function declareProject () {
  Session.reset()
  Session.workspace = Ok({} as any)
  const project = new Project('my-project', { name: 'My Project' })
  Session.project = project

  Session.checkFileAbsolutePath = path.join(repoRoot, 'src', 'alerts.ts')
  new EmailAlertChannel('in-repo', { address: 'alerts@example.com' })
  Session.checkFileAbsolutePath = path.resolve('/home/user/elsewhere/alerts.ts')
  new EmailAlertChannel('outside-repo', { address: 'alerts@example.com' })
  Session.checkFileAbsolutePath = undefined

  vi.mocked(parseProject).mockResolvedValue(project)
  return project
}

function deployedResources () {
  expect(api.projects.deploy).toHaveBeenCalledOnce()
  const [payload] = vi.mocked(api.projects.deploy).mock.calls[0]
  return payload.resources
}

describe('deploy source files', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getGitInformation).mockReturnValue(null)
    declareProject()
  })

  afterEach(() => {
    Session.reset()
  })

  it('sends each resource\'s source file relative to the git repository root', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(repoRoot)

    await Deploy.prototype.run.call(createCommandContext() as any)

    const resources = deployedResources()
    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ logicalId: 'in-repo', type: 'alert-channel', sourceFile: 'src/alerts.ts' }),
    ]))
    const outside = resources.find(resource => resource.logicalId === 'outside-repo')
    expect(outside).toBeDefined()
    expect(outside).not.toHaveProperty('sourceFile')
    expect(outside!.payload).not.toHaveProperty('sourceFile')
  })

  it('omits source files outside a git repository', async () => {
    vi.mocked(getGitRepoRoot).mockReturnValue(undefined)

    await Deploy.prototype.run.call(createCommandContext() as any)

    const resources = deployedResources()
    expect(resources).toHaveLength(2)
    for (const resource of resources) {
      expect(resource).not.toHaveProperty('sourceFile')
    }
  })
})
