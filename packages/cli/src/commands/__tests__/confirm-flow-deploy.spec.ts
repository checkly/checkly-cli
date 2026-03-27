import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn() },
  projects: { deploy: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('../../services/checkly-config-loader', () => ({
  loadChecklyConfig: vi.fn().mockResolvedValue({
    config: {
      logicalId: 'my-project',
      projectName: 'My Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
      checks: {},
    },
    constructs: [],
  }),
}))

vi.mock('../../services/project-parser', () => ({
  parseProject: vi.fn(),
}))

vi.mock('../../services/util', () => ({
  splitConfigFilePath: vi.fn().mockReturnValue({
    configDirectory: '.',
    configFilenames: ['checkly.config.ts'],
  }),
  getGitInformation: vi.fn(),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode'
import * as api from '../../rest/api'
import { parseProject } from '../../services/project-parser'
import { AuthCommand } from '../authCommand'
import Deploy from '../deploy'

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

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    style: {
      outputFormat: undefined,
      actionStart: vi.fn(),
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
  })

  it('has correct metadata', () => {
    expect(Deploy.destructive).toBe(false)
    expect(Deploy.readOnly).toBe(false)
    expect(Deploy.idempotent).toBe(true)
  })

  it('exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
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
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createConfirmContext()

    await ctx.confirmOrAbort.call(ctx as any, deployPreview, { force: true })

    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('exits before parsing or bundling in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: {
        'force': false,
        'preview': false,
        'output': false,
        'config': undefined,
        'schedule-on-deploy': true,
        'verify-runtime-dependencies': true,
        'debug-bundle': false,
        'debug-bundle-output-file': './debug-bundle.json',
      },
    })

    await expect(
      Deploy.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    expect(ctx.style.actionStart).not.toHaveBeenCalled()
    expect(api.runtimes.getAll).not.toHaveBeenCalled()
    expect(parseProject).not.toHaveBeenCalled()

    expect(ctx.logged).toHaveLength(1)
    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('deploy')
    expect(output.classification.idempotent).toBe(true)
    expect(output.confirmCommand).toContain('--force')
  })
})
