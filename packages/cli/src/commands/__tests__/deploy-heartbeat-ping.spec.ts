import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
  projects: {
    preview: vi.fn().mockResolvedValue({ planToken: 'v1.AAAAAAAAAAAAAAAAAAAAAA', diff: [] }),
    // The deploy's answer reports the heartbeat check it just created, which
    // is what the ping URL step reads.
    deploy: vi.fn().mockResolvedValue({
      data: {
        diff: [{
          logicalId: 'heartbeat-1',
          physicalId: 'hb-1',
          type: 'check',
          action: 'CREATE',
        }],
      },
    }),
  },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
  heartbeatCheck: { get: vi.fn() },
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
import { Ok } from '../../services/check-parser/package-files/result.js'
import { EmailAlertChannel } from '../../constructs/email-alert-channel.js'
import { HeartbeatMonitor } from '../../constructs/heartbeat-monitor.js'
import { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import Deploy from '../deploy.js'
import { createCommandContext as createSharedCommandContext } from './helpers/command-context.js'

function createCommandContext () {
  return createSharedCommandContext({
    command: Deploy,
    parsed: {
      flags: {
        'force': true,
        'preview': false,
        'dry-run': false,
        'plan': true,
        'plan-token': undefined,
        'prune-unmanaged-relations': false,
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
    },
    members: { account: { name: 'Test Account', runtimeId: 'runtime-default' } },
  })
}

function declareProject () {
  Session.reset()
  Session.workspace = Ok({} as any)
  const project = new Project('my-project', { name: 'My Project' })
  Session.project = project

  Session.checkFileAbsolutePath = path.join('/home/user/repo', 'src', 'checks.ts')
  new HeartbeatMonitor('heartbeat-1', {
    name: 'Heartbeat',
    period: 1,
    periodUnit: 'hours',
    grace: 10,
    graceUnit: 'minutes',
  })
  new EmailAlertChannel('alerts', { address: 'alerts@example.com' })
  Session.checkFileAbsolutePath = undefined

  vi.mocked(parseProject).mockResolvedValue(project)
  return project
}

describe('deploy heartbeat ping URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    declareProject()
  })

  afterEach(() => {
    Session.reset()
  })

  it('waits for the heartbeat ping URL fetch before the command finishes', async () => {
    let resolveGet!: (value: any) => void
    vi.mocked(api.heartbeatCheck.get).mockImplementation(
      () => new Promise<any>(resolve => {
        resolveGet = resolve
      }),
    )
    const context = createCommandContext()

    const run = Deploy.prototype.run.call(context as any)

    // The deploy itself resolves through an internal 500ms pause, so wait for
    // the ping URL fetch to have been made rather than for the run.
    await vi.waitFor(() => expect(api.heartbeatCheck.get).toHaveBeenCalledWith('hb-1'))

    // The ping URL line is part of the deploy's output, so while its fetch is
    // pending the command cannot be done.
    const settled = await Promise.race([
      run.then(() => 'settled', () => 'settled'),
      new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 50)),
    ])
    expect(settled).toBe('pending')

    resolveGet({ data: { pingUrl: 'https://ping.checkly.host/hb-1', name: 'Heartbeat' } })
    await run

    expect(context.log).toHaveBeenCalledWith(
      expect.stringContaining('Ping URL of heartbeat check Heartbeat is'),
    )
  })

  it('reports a failed heartbeat ping URL fetch as a warning, not a failed deploy', async () => {
    vi.mocked(api.heartbeatCheck.get).mockRejectedValue(new Error('fetch failed'))
    const context = createCommandContext()
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      await Deploy.prototype.run.call(context as any)

      // The failure belongs to the deploy command, not to the process's
      // unhandled rejection path.
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(unhandled).toEqual([])

      // The deploy was written before the fetch, so it is not reported as failed.
      expect(context.style.actionSuccess).toHaveBeenCalled()
      expect(context.style.actionFailure).not.toHaveBeenCalled()
      expect(context.style.longError).not.toHaveBeenCalled()
      expect(context.exit).not.toHaveBeenCalled()
      expect(context.style.longWarning).toHaveBeenCalledWith(
        'The project was deployed, but the ping URL of heartbeat check "heartbeat-1" could not be retrieved.',
        expect.objectContaining({ message: 'fetch failed' }),
      )
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})
