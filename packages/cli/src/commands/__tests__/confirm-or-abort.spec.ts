import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock cli-mode before importing AuthCommand
vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

// Mock prompts
vi.mock('prompts', () => ({
  default: vi.fn(() => Promise.resolve({ confirm: true })),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import prompts from 'prompts'
import type { CommandPreview } from '../../helpers/command-preview.js'

// Minimal AuthCommand-like context for testing confirmOrAbort
// We import the actual method after mocks are set up
import { AuthCommand } from '../authCommand.js'

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

  it('asks the terminal question under the rendered plan, and renders it only there', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    const plan = vi.fn(() => 'Deploy preview\n')
    const preview: CommandPreview = {
      ...basePreview,
      terminal: { plan, changes: ['Deploy project "Acme"'] },
      question: 'Apply these changes?',
    }

    const ctx = createMockCommand()
    await AuthCommand.prototype.confirmOrAbort.call(
      { ...ctx, constructor: AuthCommand } as any,
      preview,
      { force: false, dryRun: false },
    )
    expect(plan).toHaveBeenCalledOnce()
    expect(ctx.logged[0]).toBe('Deploy preview\n\nThis will Deploy project "Acme"')
    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ message: 'Apply these changes?' })

    // Neither a forced run nor an agent envelope shows the plan, so neither
    // renders it; the envelope keeps the flat changes.
    plan.mockClear()
    await AuthCommand.prototype.confirmOrAbort.call(
      { ...createMockCommand(), constructor: AuthCommand } as any,
      preview,
      { force: true },
    )
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const agent = createMockCommand()
    await expect(AuthCommand.prototype.confirmOrAbort.call(
      { ...agent, constructor: AuthCommand } as any,
      preview,
      { force: false },
    )).rejects.toThrow('EXIT_2')
    expect(plan).not.toHaveBeenCalled()
    expect(JSON.parse(agent.logged[0]).changes).toEqual(['Will create incident "Test"'])
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

  it('calls interactiveConfirm instead of default prompt when provided', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const customConfirm = vi.fn().mockResolvedValue(true)
    const ctx = createMockCommand()

    await AuthCommand.prototype.confirmOrAbort.call(
      { ...ctx, constructor: AuthCommand } as any,
      basePreview,
      { force: false, interactiveConfirm: customConfirm },
    )

    expect(customConfirm).toHaveBeenCalledTimes(1)
    expect(prompts).not.toHaveBeenCalled()
    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('exits 0 when interactiveConfirm returns false', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const customConfirm = vi.fn().mockResolvedValue(false)
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, interactiveConfirm: customConfirm },
      ),
    ).rejects.toThrow('EXIT_0')

    expect(customConfirm).toHaveBeenCalledTimes(1)
    expect(ctx.exit).toHaveBeenCalledWith(0)
  })

  it('ignores interactiveConfirm in agent mode and exits 2', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const customConfirm = vi.fn().mockResolvedValue(true)
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false, interactiveConfirm: customConfirm },
      ),
    ).rejects.toThrow('EXIT_2')

    expect(customConfirm).not.toHaveBeenCalled()
  })

  it('works without dryRun option (defaults to falsy)', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const ctx = createMockCommand()

    await expect(
      AuthCommand.prototype.confirmOrAbort.call(
        { ...ctx, constructor: AuthCommand } as any,
        basePreview,
        { force: false },
      ),
    ).rejects.toThrow('EXIT_2')

    const output = JSON.parse(ctx.logged[0])
    expect(output.status).toBe('confirmation_required')
  })
})

describe('confirmOrAbort with alternatives', () => {
  const alternative = { title: 'Do the other thing', run: vi.fn(() => Promise.resolve()) }
  const withAlternative: CommandPreview = {
    ...basePreview,
    question: 'Apply these changes?',
    terminal: { plan: () => 'the plan', changes: ['deploy'], alternatives: [alternative] },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('interactive')
  })

  it('asks a list with the alternative between apply and cancel, starting on cancel', async () => {
    vi.mocked(prompts).mockResolvedValue({ action: 'apply' })
    const ctx = createMockCommand()

    await AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false })

    expect(vi.mocked(prompts).mock.calls[0][0]).toEqual({
      name: 'action',
      type: 'select',
      message: 'Apply these changes?',
      choices: [
        { title: 'Yes, apply these changes', value: 'apply' },
        { title: 'Do the other thing', value: 'alternative:0' },
        { title: 'Cancel', value: 'cancel' },
      ],
      initial: 2,
    })
    expect(alternative.run).not.toHaveBeenCalled()
    expect(ctx.exit).not.toHaveBeenCalled()
  })

  it('runs the chosen alternative and then ends the command without applying', async () => {
    vi.mocked(prompts).mockResolvedValue({ action: 'alternative:0' })
    const ctx = createMockCommand()

    await expect(AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false }))
      .rejects.toThrow('EXIT_0')

    expect(alternative.run).toHaveBeenCalledOnce()
  })

  it('ends the command on cancel and on an aborted prompt', async () => {
    for (const answer of [{ action: 'cancel' }, {}]) {
      vi.mocked(prompts).mockResolvedValue(answer)
      const ctx = createMockCommand()
      await expect(AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false }))
        .rejects.toThrow('EXIT_0')
    }
    expect(alternative.run).not.toHaveBeenCalled()
  })

  it('keeps the yes/no question when there is nothing else to offer', async () => {
    vi.mocked(prompts).mockResolvedValue({ confirm: true })
    const ctx = createMockCommand()
    const plain: CommandPreview = { ...withAlternative, terminal: { plan: () => 'the plan', changes: ['deploy'], alternatives: [] } }

    await AuthCommand.prototype.confirmOrAbort.call(ctx as any, plain, { force: false })

    expect(vi.mocked(prompts).mock.calls[0][0]).toMatchObject({ type: 'confirm', message: 'Apply these changes?' })
  })

  it('lets a command-supplied confirm win over the alternatives', async () => {
    const ctx = createMockCommand()
    const interactiveConfirm = vi.fn(() => Promise.resolve(true))

    await AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false, interactiveConfirm })

    expect(interactiveConfirm).toHaveBeenCalledOnce()
    expect(prompts).not.toHaveBeenCalled()
  })

  it('never offers the alternative to an agent, a forced run or a dry run', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    let ctx = createMockCommand()
    await expect(AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false })).rejects.toThrow('EXIT_2')
    expect(JSON.parse(ctx.logged[0])).not.toHaveProperty('terminal')

    ctx = createMockCommand()
    await AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: true })
    ctx = createMockCommand()
    await expect(AuthCommand.prototype.confirmOrAbort.call(ctx as any, withAlternative, { force: false, dryRun: true })).rejects.toThrow('EXIT_0')
    expect(prompts).not.toHaveBeenCalled()
    expect(alternative.run).not.toHaveBeenCalled()
  })
})
