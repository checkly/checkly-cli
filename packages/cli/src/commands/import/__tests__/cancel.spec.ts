import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../../rest/api', () => ({
  projects: {
    findImportPlans: vi.fn(),
    cancelImportPlan: vi.fn(),
  },
}))

vi.mock('../../../services/checkly-config-loader', () => ({
  loadChecklyConfig: vi.fn(),
}))

import { detectCliMode } from '../../../helpers/cli-mode.js'
import * as api from '../../../rest/api.js'
import { loadChecklyConfig } from '../../../services/checkly-config-loader.js'
import { ImportPlan } from '../../../rest/projects.js'
import ImportCancelCommand from '../cancel.js'

function plan (id: string): ImportPlan {
  return { id, createdAt: new Date(0).toISOString() }
}

// Defaults to --force so that tests covering selection are not also exercising
// the confirmation gate; the gate has its own tests below.
function cancelFlags (overrides: Record<string, unknown> = {}) {
  return {
    flags: {
      'config': undefined,
      'all': false,
      'plan-id': undefined,
      'force': true,
      'dry-run': false,
      ...overrides,
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
    confirmOrAbort: vi.fn(),
    style: {
      actionStart: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      shortSuccess: vi.fn(),
      fatal: vi.fn(),
    },
    constructor: ImportCancelCommand,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('import cancel command (non-interactive)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.cancelImportPlan).mockResolvedValue({} as any)
  })

  it('auto-cancels the single plan in agent mode', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [plan('only')] } as any)
    const ctx = createCommandContext(cancelFlags())

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(api.projects.cancelImportPlan).toHaveBeenCalledTimes(1)
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('only')
    expect(ctx.style.actionSuccess).toHaveBeenCalled()
  })

  it('cancels every plan when --all is given', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b'), plan('c')],
    } as any)
    const ctx = createCommandContext(cancelFlags({ all: true }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(api.projects.cancelImportPlan).toHaveBeenCalledTimes(3)
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('a')
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('b')
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('c')
  })

  it('targets the plan named by --plan-id when several exist', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b'), plan('c')],
    } as any)
    const ctx = createCommandContext(cancelFlags({ 'plan-id': 'b' }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(api.projects.cancelImportPlan).toHaveBeenCalledTimes(1)
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('b')
  })

  it('fails with exit 1 when the selection is ambiguous and no --plan-id is given', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext(cancelFlags())

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('--plan-id'))
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })

  it('names the candidate plan IDs when the selection is ambiguous', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('abc123'), plan('def456')],
    } as any)
    const ctx = createCommandContext(cancelFlags())

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('abc123'))
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('def456'))
  })
})

describe('import cancel command (flag validation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.cancelImportPlan).mockResolvedValue({} as any)
  })

  it('rejects --all together with --plan-id (exit 1) instead of silently ignoring one', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext(cancelFlags({ 'all': true, 'plan-id': 'a' }))

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('cannot be used together'))
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })

  it('rejects --all with --plan-id before fetching, so zero plans cannot mask the conflict', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [] } as any)
    const ctx = createCommandContext(cancelFlags({ 'all': true, 'plan-id': 'a' }))

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('cannot be used together'))
    expect(api.projects.findImportPlans).not.toHaveBeenCalled()
  })
})

describe('import cancel command (empty candidate list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [] } as any)
    vi.mocked(api.projects.cancelImportPlan).mockResolvedValue({} as any)
  })

  it('fails with exit 1 when --plan-id is given but no plans exist', async () => {
    const ctx = createCommandContext(cancelFlags({ 'plan-id': 'abc123' }))

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('abc123'))
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })

  it('reports nothing-to-do without failing when no plan was requested', async () => {
    const ctx = createCommandContext(cancelFlags())

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(ctx.exit).not.toHaveBeenCalled()
    expect(ctx.style.fatal).not.toHaveBeenCalled()
    expect(ctx.logged.join('\n')).toContain('Nothing to cancel')
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })

  it('reports nothing-to-do without failing for --all', async () => {
    const ctx = createCommandContext(cancelFlags({ all: true }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(ctx.exit).not.toHaveBeenCalled()
    expect(ctx.logged.join('\n')).toContain('Nothing to cancel')
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })
})

describe('import cancel command (confirmation gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.cancelImportPlan).mockResolvedValue({} as any)
  })

  it('is classified as destructive', () => {
    expect(ImportCancelCommand.destructive).toBe(true)
    expect(ImportCancelCommand.readOnly).toBe(false)
  })

  it('asks for confirmation before cancelling, pinning the resolved plan ID', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [plan('only')] } as any)
    const ctx = createCommandContext(cancelFlags({ force: false }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(ctx.confirmOrAbort).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'import cancel',
        changes: [expect.stringContaining('only')],
        // Pinned so the confirming run cannot resolve to a different plan.
        flags: expect.objectContaining({ 'plan-id': 'only' }),
        classification: expect.objectContaining({ destructive: true }),
      }),
      { force: false, dryRun: false },
    )
  })

  it('never renders --no-all in the confirm command for a single plan', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [plan('only')] } as any)
    const ctx = createCommandContext(cancelFlags({ force: false }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    // `buildConfirmCommand` renders a false boolean as `--no-all`, which this
    // command does not accept, so `all` must be dropped rather than passed on.
    const [preview] = vi.mocked(ctx.confirmOrAbort).mock.calls[0] as any[]
    expect(preview.flags.all).toBeUndefined()
  })

  it('confirms with --all when every plan is targeted', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext(cancelFlags({ all: true, force: false }))

    await ImportCancelCommand.prototype.run.call(ctx as any)

    const [preview] = vi.mocked(ctx.confirmOrAbort).mock.calls[0] as any[]
    expect(preview.flags.all).toBe(true)
    expect(preview.flags['plan-id']).toBeUndefined()
    expect(preview.changes).toHaveLength(2)
  })
})
