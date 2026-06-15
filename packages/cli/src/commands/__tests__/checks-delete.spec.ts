import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  checks: { get: vi.fn(), delete: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import * as api from '../../rest/api.js'
import { NotFoundError } from '../../rest/errors.js'
import { AuthCommand } from '../authCommand.js'
import ChecksDelete from '../checks/delete.js'

const check = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Homepage',
  checkType: 'BROWSER',
}

function createCommandContext (Command: typeof AuthCommand, parsed: unknown) {
  const logged: string[] = []
  let exitCodeValue: number | undefined
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    error: vi.fn((message: string) => {
      throw new Error(message)
    }),
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
      shortSuccess: vi.fn(),
      shortError: vi.fn(),
      longError: vi.fn(),
    },
    constructor: Command,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('checks delete command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.checks.get).mockResolvedValue({ data: check } as any)
    vi.mocked(api.checks.delete).mockResolvedValue({} as any)
  })

  it('exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(ChecksDelete, {
      args: { id: check.id },
      flags: { 'force': false, 'dry-run': false },
    })

    await expect(
      ChecksDelete.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('checks delete')
    expect(output.classification.destructive).toBe(true)
    expect(output.confirmCommand).toContain('--force')
    expect(output.confirmCommand).toContain(check.id)
    expect(output.changes[0]).toContain(check.name)
    expect(output.changes[1]).toContain('recreated on the next deploy')
    expect(api.checks.delete).not.toHaveBeenCalled()
  })

  it('executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(ChecksDelete, {
      args: { id: check.id },
      flags: { 'force': true, 'dry-run': false },
    })

    await ChecksDelete.prototype.run.call(ctx as any)

    expect(api.checks.delete).toHaveBeenCalledWith(check.id)
    expect(ctx.style.shortSuccess).toHaveBeenCalledWith(`Check "${check.name}" deleted.`)
  })

  it('shows preview and exits 0 with --dry-run', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(ChecksDelete, {
      args: { id: check.id },
      flags: { 'force': false, 'dry-run': true },
    })

    await expect(
      ChecksDelete.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('dry_run')
    expect(api.checks.delete).not.toHaveBeenCalled()
  })

  it('reports a friendly message when the check does not exist', async () => {
    vi.mocked(api.checks.get).mockRejectedValue(new NotFoundError({
      statusCode: 404,
      error: 'Not Found',
      message: 'Check not found',
    }))
    const ctx = createCommandContext(ChecksDelete, {
      args: { id: check.id },
      flags: { 'force': true, 'dry-run': false },
    })

    await ChecksDelete.prototype.run.call(ctx as any)

    expect(ctx.style.shortError).toHaveBeenCalledWith(
      `Check "${check.id}" not found. It may have already been deleted.`,
    )
    expect(process.exitCode).toBe(1)
    expect(api.checks.delete).not.toHaveBeenCalled()
  })

  it('sets exit code 1 when the delete fails', async () => {
    vi.mocked(api.checks.delete).mockRejectedValue(new Error('boom'))
    const ctx = createCommandContext(ChecksDelete, {
      args: { id: check.id },
      flags: { 'force': true, 'dry-run': false },
    })

    await ChecksDelete.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to delete check.', expect.any(Error))
    expect(process.exitCode).toBe(1)
  })

  it('has correct metadata', () => {
    expect(ChecksDelete.readOnly).toBe(false)
    expect(ChecksDelete.destructive).toBe(true)
    expect(ChecksDelete.idempotent).toBe(true)
  })
})
