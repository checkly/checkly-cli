import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  environmentVariables: { delete: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode'
import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import EnvRm from '../env/rm'

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
    style: { outputFormat: undefined, shortSuccess: vi.fn(), longError: vi.fn() },
    constructor: EnvRm,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('env rm confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      args: { key: 'MY_VAR' },
      flags: { force: false },
    })

    await expect(
      EnvRm.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('env rm')
    expect(output.confirmCommand).toContain('--force')
    expect(api.environmentVariables.delete).not.toHaveBeenCalled()
  })

  it('executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      args: { key: 'MY_VAR' },
      flags: { force: true },
    })

    await EnvRm.prototype.run.call(ctx as any)

    expect(api.environmentVariables.delete).toHaveBeenCalledWith('MY_VAR')
  })

  it('has correct metadata', () => {
    expect(EnvRm.destructive).toBe(true)
    expect(EnvRm.readOnly).toBe(false)
  })
})
