import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock cli-mode before importing AuthCommand
vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

// Mock prompts
vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode'
import prompts from 'prompts'
import type { CommandPreview } from '../../helpers/command-preview'

// Minimal AuthCommand-like context for testing confirmOrAbort
// We import the actual method after mocks are set up
import { AuthCommand } from '../authCommand'

const basePreview: CommandPreview = {
  command: 'incidents create',
  description: 'Create incident on status page',
  changes: ['Will create incident "Test"'],
  flags: { title: 'Test' },
  classification: { readOnly: false, destructive: false, idempotent: false },
}

function createMockCommand (overrides: Record<string, unknown> = {}) {
  const logged: string[] = []
  let exitCode: number | undefined

  return {
    log: vi.fn((msg: string) => logged.push(msg)),
    exit: vi.fn((code: number) => {
      exitCode = code
      throw new Error(`EXIT_${code}`)
    }),
    style: { outputFormat: undefined },
    logged,
    get exitCode () {
      return exitCode
    },
    ...overrides,
  }
}

describe('confirmOrAbort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns immediately for read-only commands', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createMockCommand()

    // Simulate readOnly = true by setting constructor statics
    const ReadOnlyCommand = class extends AuthCommand {
      static readOnly = true
    }

    await AuthCommand.prototype.confirmOrAbort.call(
      { ...ctx, constructor: ReadOnlyCommand } as any,
      basePreview,
      { force: false, dryRun: false },
    )

    expect(ctx.log).not.toHaveBeenCalled()
    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('returns immediately when force is true', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createMockCommand()

    await AuthCommand.prototype.confirmOrAbort.call(
      { ...ctx, constructor: AuthCommand } as any,
      basePreview,
      { force: true, dryRun: false },
    )

    expect(ctx.log).not.toHaveBeenCalled()
    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('outputs dry-run JSON and exits 0 when dryRun is true', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, dryRun: true },
      ),
    ).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('dry_run')
    expect(ctx.exit).toHaveBeenCalledWith(0)
  })

  it('outputs dry-run JSON even when force is also true', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: true, dryRun: true },
      ),
    ).rejects.toThrow('EXIT_0')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('dry_run')
  })

  it('prompts for confirmation in interactive mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    const ctx = createMockCommand()

    await AuthCommand.prototype.confirmOrAbort.call(
      { ...ctx, constructor: AuthCommand } as any,
      basePreview,
      { force: false, dryRun: false },
    )

    expect(prompts).toHaveBeenCalledTimes(1)
    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('exits 0 when user declines interactive confirmation', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: false })
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, dryRun: false },
      ),
    ).rejects.toThrow('EXIT_0')

    expect(ctx.exit).toHaveBeenCalledWith(0)
  })

  it('outputs structured JSON and exits 2 in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, dryRun: false },
      ),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
    expect(output.confirmCommand).toContain('--force')
    expect(ctx.exit).toHaveBeenCalledWith(2)
  })

  it('outputs structured JSON and exits 2 in ci mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('ci')
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, dryRun: false },
      ),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
  })
})
