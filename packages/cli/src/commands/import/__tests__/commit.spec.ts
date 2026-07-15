import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../../rest/api', () => ({
  projects: {
    findImportPlans: vi.fn(),
    commitImportPlan: vi.fn(),
  },
}))

vi.mock('../../../services/checkly-config-loader', () => ({
  loadChecklyConfig: vi.fn(),
}))

import { detectCliMode } from '../../../helpers/cli-mode.js'
import * as api from '../../../rest/api.js'
import { loadChecklyConfig } from '../../../services/checkly-config-loader.js'
import { ImportPlan } from '../../../rest/projects.js'
import ImportCommitCommand from '../commit.js'

// `import commit` only considers plans that have already been applied.
function appliedPlan (id: string): ImportPlan {
  return { id, createdAt: new Date(0).toISOString(), appliedAt: new Date(1).toISOString() }
}

// Defaults to --force so that tests covering selection are not also exercising
// the confirmation gate; the gate has its own tests below.
function commitFlags (overrides: Record<string, unknown> = {}) {
  return {
    flags: {
      'config': undefined,
      'plan-id': undefined,
      'force': true,
      'dry-run': false,
      ...overrides,
    },
  }
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: vi.fn(),
    style: {
      actionStart: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      fatal: vi.fn(),
    },
    constructor: ImportCommitCommand,
    logged,
  }
}

describe('import commit command (non-interactive)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.commitImportPlan).mockResolvedValue({} as any)
  })

  it('auto-commits the single applied plan in agent mode', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [appliedPlan('only')] } as any)
    const ctx = createCommandContext(commitFlags())

    await ImportCommitCommand.prototype.run.call(ctx as any)

    expect(api.projects.commitImportPlan).toHaveBeenCalledWith('only')
  })

  it('ignores plans that have not been applied yet', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [appliedPlan('applied'), { id: 'unapplied', createdAt: new Date(0).toISOString() }],
    } as any)
    const ctx = createCommandContext(commitFlags())

    await ImportCommitCommand.prototype.run.call(ctx as any)

    expect(api.projects.commitImportPlan).toHaveBeenCalledWith('applied')
  })

  it('fails with exit 1 when the selection is ambiguous, naming the candidates', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [appliedPlan('abc123'), appliedPlan('def456')],
    } as any)
    const ctx = createCommandContext(commitFlags())

    await expect(ImportCommitCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('abc123'))
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('def456'))
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })

  it('fails with exit 1 when --plan-id is given but no plans exist', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [] } as any)
    const ctx = createCommandContext(commitFlags({ 'plan-id': 'abc123' }))

    await expect(ImportCommitCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('abc123'))
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })

  it('reports nothing-to-do without failing when no plan was requested', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [] } as any)
    const ctx = createCommandContext(commitFlags())

    await ImportCommitCommand.prototype.run.call(ctx as any)

    expect(ctx.exit).not.toHaveBeenCalled()
    expect(ctx.style.fatal).not.toHaveBeenCalled()
    expect(ctx.logged.join('\n')).toContain('Nothing to commit')
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })
})

describe('import commit command (confirmation gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.commitImportPlan).mockResolvedValue({} as any)
  })

  it('asks for confirmation before committing', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [appliedPlan('only')] } as any)
    const ctx = createCommandContext(commitFlags({ force: false }))

    await ImportCommitCommand.prototype.run.call(ctx as any)

    expect(ctx.confirmOrAbort).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'import commit' }),
      expect.objectContaining({ force: false, dryRun: false }),
    )
  })

  it('pins the resolved plan ID so the confirming run cannot commit a different plan', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [appliedPlan('abc123')] } as any)
    // No --plan-id: the CLI resolved the target itself, so the preview is the
    // only place the caller can learn which plan it is confirming.
    const ctx = createCommandContext(commitFlags({ force: false }))

    await ImportCommitCommand.prototype.run.call(ctx as any)

    const [preview] = vi.mocked(ctx.confirmOrAbort).mock.calls[0] as any[]
    expect(preview.flags['plan-id']).toBe('abc123')
    expect(preview.changes.join('\n')).toContain('abc123')
  })

  it('commits once confirmation is satisfied', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [appliedPlan('only')] } as any)
    const ctx = createCommandContext(commitFlags({ force: true }))

    await ImportCommitCommand.prototype.run.call(ctx as any)

    expect(api.projects.commitImportPlan).toHaveBeenCalledWith('only')
  })

  it('does not commit when the gate exits first', async () => {
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [appliedPlan('only')] } as any)
    const ctx = createCommandContext(commitFlags({ force: false }))
    // Mirrors the real agent-mode gate, which exits 2 rather than returning.
    ctx.confirmOrAbort.mockRejectedValue(new Error('EXIT_2'))

    await expect(ImportCommitCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })
})
