import { Parser } from '@oclif/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  projects: { deleteProject: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('../../services/checkly-config-loader', () => ({
  loadChecklyConfig: vi.fn().mockResolvedValue({
    config: { logicalId: 'my-project', projectName: 'My Project' },
  }),
}))

vi.mock('../../services/util', () => ({
  splitConfigFilePath: vi.fn().mockReturnValue({
    configDirectory: '.',
    configFilenames: ['checkly.config.ts'],
  }),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import prompts from 'prompts'
import * as api from '../../rest/api.js'
import { buildConfirmCommand } from '../../helpers/command-preview.js'
import { AuthCommand } from '../authCommand.js'
import Destroy from '../destroy.js'

/** Turn a generated confirmCommand back into argv, so oclif can re-parse it. */
function flagArgv (confirmCommand: string): string[] {
  return [...confirmCommand.matchAll(/--[a-zA-Z0-9-]+(?:="[^"]*")?/g)]
    .map(([token]) => token.replace(/="(.*)"$/, '=$1'))
}

async function confirmCommandFor (argv: string[]): Promise<string> {
  const { flags, metadata } = await Parser.parse(argv, { flags: Destroy.flags, strict: true })
  return buildConfirmCommand('destroy', flags, undefined, metadata.flags)
}

function createCommandContext (parsed: { flags: Record<string, unknown>, metadata?: unknown }) {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  return {
    parse: vi.fn().mockResolvedValue({ metadata: { flags: {} }, ...parsed }),
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
      longError: vi.fn(),
      actionStart: vi.fn(),
      actionStatus: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
    },
    constructor: Destroy,
    account: { name: 'Test Account' },
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('destroy confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: { force: false },
    })

    await expect(
      Destroy.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('destroy')
    expect(output.classification.destructive).toBe(true)
    expect(output.confirmCommand).toContain('--force')
    expect(api.projects.deleteProject).not.toHaveBeenCalled()
  })

  it('executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: { 'force': true, 'preserve-resources': false },
    })

    await Destroy.prototype.run.call(ctx as any)

    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', expect.objectContaining({ preserveResources: false }))
  })

  it('prompts for project name in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ projectName: 'My Project' })
    const ctx = createCommandContext({
      flags: { 'force': false, 'preserve-resources': false },
    })

    await Destroy.prototype.run.call(ctx as any)

    expect(prompts).toHaveBeenCalledTimes(1)
    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', expect.objectContaining({ preserveResources: false }))
  })

  it('aborts when project name does not match in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ projectName: 'wrong-name' })
    const ctx = createCommandContext({
      flags: { force: false },
    })

    await expect(
      Destroy.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_0')

    expect(api.projects.deleteProject).not.toHaveBeenCalled()
    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('doesn\'t match the expected project name'),
    )
  })

  it('aborts silently when interactive confirmation is cancelled', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ projectName: undefined })
    const ctx = createCommandContext({
      flags: { force: false },
    })

    await expect(
      Destroy.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_0')

    expect(api.projects.deleteProject).not.toHaveBeenCalled()
    expect(ctx.log).not.toHaveBeenCalledWith(
      expect.stringContaining('doesn\'t match the expected project name'),
    )
  })

  it('passes preserveResources flag to deleteProject', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: { 'force': true, 'preserve-resources': true },
    })

    await Destroy.prototype.run.call(ctx as any)

    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', expect.objectContaining({ preserveResources: true }))
    expect(ctx.logged[0]).toContain('preserved as account-level resources')
  })

  it('passes cancel-in-progress-deployment flag to deleteProject', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      flags: { 'force': true, 'cancel-in-progress-deployment': true },
    })

    await Destroy.prototype.run.call(ctx as any)

    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', expect.objectContaining({ cancelInProgress: true }))
  })

  it('has correct metadata', () => {
    expect(Destroy.destructive).toBe(true)
    expect(Destroy.readOnly).toBe(false)
    expect(Destroy.idempotent).toBe(false)
  })
})

describe('destroy confirmCommand', () => {
  it('echoes only the flags the user typed', async () => {
    expect(await confirmCommandFor([])).toBe('checkly destroy --force')
    expect(await confirmCommandFor(['--preserve-resources'])).toBe('checkly destroy --preserve-resources --force')
  })

  it('generates a command oclif can parse back', async () => {
    for (const argv of [[], ['--preserve-resources'], ['--cancel-in-progress-deployment']]) {
      const confirmCommand = await confirmCommandFor(argv)
      await expect(
        Parser.parse(flagArgv(confirmCommand), { flags: Destroy.flags, strict: true }),
        `confirmCommand for "checkly destroy ${argv.join(' ')}" must be runnable: ${confirmCommand}`,
      ).resolves.toBeDefined()
    }
  })
})
