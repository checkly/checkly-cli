import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode'
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
})
