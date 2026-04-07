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

import { detectCliMode } from '../../helpers/cli-mode'
import prompts from 'prompts'
import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import Destroy from '../destroy'

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
    style: { outputFormat: undefined, longError: vi.fn() },
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

    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', { preserveResources: false })
  })

  it('prompts for project name in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ projectName: 'My Project' })
    const ctx = createCommandContext({
      flags: { 'force': false, 'preserve-resources': false },
    })

    await Destroy.prototype.run.call(ctx as any)

    expect(prompts).toHaveBeenCalledTimes(1)
    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', { preserveResources: false })
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

    expect(api.projects.deleteProject).toHaveBeenCalledWith('my-project', { preserveResources: true })
    expect(ctx.logged[0]).toContain('preserved as account-level resources')
  })

  it('has correct metadata', () => {
    expect(Destroy.destructive).toBe(true)
    expect(Destroy.readOnly).toBe(false)
    expect(Destroy.idempotent).toBe(false)
  })
})
