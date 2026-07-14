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
    const ctx = createCommandContext({ flags: { 'config': undefined, 'all': false, 'plan-id': undefined } })

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
    const ctx = createCommandContext({ flags: { 'config': undefined, 'all': true, 'plan-id': undefined } })

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
    const ctx = createCommandContext({ flags: { 'config': undefined, 'all': false, 'plan-id': 'b' } })

    await ImportCancelCommand.prototype.run.call(ctx as any)

    expect(api.projects.cancelImportPlan).toHaveBeenCalledTimes(1)
    expect(api.projects.cancelImportPlan).toHaveBeenCalledWith('b')
  })

  it('fails with exit 1 when the selection is ambiguous and no --plan-id is given', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'all': false, 'plan-id': undefined } })

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('--plan-id'))
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })

  it('rejects --all together with --plan-id (exit 1) instead of silently ignoring one', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'all': true, 'plan-id': 'a' } })

    await expect(ImportCancelCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('cannot be used together'))
    expect(api.projects.cancelImportPlan).not.toHaveBeenCalled()
  })
})
