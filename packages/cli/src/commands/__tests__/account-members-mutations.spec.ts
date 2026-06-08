import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  accountMembers: { getAll: vi.fn(), updateRole: vi.fn(), delete: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import * as api from '../../rest/api.js'
import { AuthCommand } from '../authCommand.js'
import MembersUpdate, { normalizeAccountMemberUpdateRole } from '../members/update.js'
import MembersDelete from '../members/delete.js'

const updatedMember = {
  type: 'member' as const,
  accountId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  isSupportMembership: false,
  ssoEnabled: false,
  mfaEnabled: true,
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
      longError: vi.fn(),
    },
    constructor: Command,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('account members mutation commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.accountMembers.getAll).mockResolvedValue({
      data: { members: [updatedMember], length: 1, nextId: null },
    } as any)
    vi.mocked(api.accountMembers.updateRole).mockResolvedValue({ data: updatedMember } as any)
    vi.mocked(api.accountMembers.delete).mockResolvedValue({} as any)
  })

  it('normalizes update role values and excludes owner', () => {
    expect(normalizeAccountMemberUpdateRole('admin')).toBe('ADMIN')
    expect(normalizeAccountMemberUpdateRole('Read_Run')).toBe('READ_RUN')
    expect(normalizeAccountMemberUpdateRole(' read_only ')).toBe('READ_ONLY')
    expect(normalizeAccountMemberUpdateRole('owner')).toBeUndefined()
    expect(normalizeAccountMemberUpdateRole('superadmin')).toBeUndefined()
  })

  it('members update exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersUpdate, {
      args: { member: updatedMember.userId },
      flags: {
        'role': 'admin',
        'email': false,
        'id': false,
        'output': 'table',
        'force': false,
        'dry-run': false,
      },
    })

    await expect(
      MembersUpdate.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('members update')
    expect(output.confirmCommand).toContain('--force')
    expect(output.confirmCommand).toContain(updatedMember.userId)
    expect(api.accountMembers.updateRole).not.toHaveBeenCalled()
  })

  it('members update executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersUpdate, {
      args: { member: updatedMember.userId },
      flags: {
        'role': 'read_run',
        'email': false,
        'id': false,
        'output': 'json',
        'force': true,
        'dry-run': false,
      },
    })

    await MembersUpdate.prototype.run.call(ctx as any)

    expect(api.accountMembers.updateRole).toHaveBeenCalledWith(updatedMember.userId, 'READ_RUN')
    expect(JSON.parse(ctx.logged[0])).toMatchObject({
      userId: updatedMember.userId,
      email: updatedMember.email,
    })
  })

  it('members update resolves an email before updating', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersUpdate, {
      args: { member: updatedMember.email.toUpperCase() },
      flags: {
        'role': 'read_only',
        'email': false,
        'id': false,
        'output': 'json',
        'force': true,
        'dry-run': false,
      },
    })

    await MembersUpdate.prototype.run.call(ctx as any)

    expect(api.accountMembers.getAll).toHaveBeenCalledWith({
      search: updatedMember.email.toUpperCase(),
      type: 'member',
      status: 'ACTIVE',
    })
    expect(api.accountMembers.updateRole).toHaveBeenCalledWith(updatedMember.userId, 'READ_ONLY')
  })

  it('members update can force email-looking values to be treated as IDs', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersUpdate, {
      args: { member: 'user@example.com' },
      flags: {
        'role': 'read_only',
        'email': false,
        'id': true,
        'output': 'json',
        'force': true,
        'dry-run': false,
      },
    })

    await MembersUpdate.prototype.run.call(ctx as any)

    expect(api.accountMembers.getAll).not.toHaveBeenCalled()
    expect(api.accountMembers.updateRole).toHaveBeenCalledWith('user@example.com', 'READ_ONLY')
  })

  it('members update rejects owner role locally', async () => {
    const ctx = createCommandContext(MembersUpdate, {
      args: { member: updatedMember.userId },
      flags: {
        'role': 'owner',
        'email': false,
        'id': false,
        'output': 'table',
        'force': true,
        'dry-run': false,
      },
    })

    await expect(
      MembersUpdate.prototype.run.call(ctx as any),
    ).rejects.toThrow('Invalid --role "owner"')

    expect(api.accountMembers.updateRole).not.toHaveBeenCalled()
  })

  it('members delete exits 2 in agent mode without --force', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersDelete, {
      args: { member: updatedMember.userId },
      flags: {
        'email': false,
        'id': false,
        'force': false,
        'dry-run': false,
      },
    })

    await expect(
      MembersDelete.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.command).toBe('members delete')
    expect(output.classification.destructive).toBe(true)
    expect(output.confirmCommand).toContain('--force')
    expect(output.confirmCommand).toContain(updatedMember.userId)
    expect(api.accountMembers.delete).not.toHaveBeenCalled()
  })

  it('members delete executes with --force in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersDelete, {
      args: { member: updatedMember.userId },
      flags: {
        'email': false,
        'id': false,
        'force': true,
        'dry-run': false,
      },
    })

    await MembersDelete.prototype.run.call(ctx as any)

    expect(api.accountMembers.delete).toHaveBeenCalledWith(updatedMember.userId)
  })

  it('members delete resolves an email before showing the confirmation preview', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createCommandContext(MembersDelete, {
      args: { member: updatedMember.email },
      flags: {
        'email': false,
        'id': false,
        'force': false,
        'dry-run': false,
      },
    })

    await expect(
      MembersDelete.prototype.run.call(ctx as any),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(api.accountMembers.getAll).toHaveBeenCalledWith({
      search: updatedMember.email,
      type: 'member',
      status: 'ACTIVE',
    })
    expect(output.changes[0]).toContain(updatedMember.email)
    expect(output.changes[0]).toContain(updatedMember.userId)
    expect(api.accountMembers.delete).not.toHaveBeenCalled()
  })

  it('has correct metadata', () => {
    expect(MembersUpdate.readOnly).toBe(false)
    expect(MembersUpdate.destructive).toBe(false)
    expect(MembersUpdate.idempotent).toBe(true)
    expect(MembersDelete.readOnly).toBe(false)
    expect(MembersDelete.destructive).toBe(true)
    expect(MembersDelete.idempotent).toBe(true)
  })
})
