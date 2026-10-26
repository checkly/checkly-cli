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

import { detectCliMode } from '../../helpers/cli-mode.js'
import * as api from '../../rest/api.js'
import EnvRm from '../env/rm.js'
import { createCommandContext as createSharedCommandContext } from './helpers/command-context.js'

function createCommandContext (parsed: Record<string, unknown>) {
  return createSharedCommandContext({ command: EnvRm, parsed })
}

describe('env rm confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exits 3 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext({
      args: { key: 'MY_VAR' },
      flags: { force: false },
    })

    await expect(
      EnvRm.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_3')

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
