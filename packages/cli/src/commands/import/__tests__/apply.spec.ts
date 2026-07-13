import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../../rest/api', () => ({
  projects: {
    findImportPlans: vi.fn(),
    applyImportPlan: vi.fn(),
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
import ImportApplyCommand from '../apply.js'

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
      fatal: vi.fn(),
    },
    constructor: ImportApplyCommand,
    logged,
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

describe('import apply command (non-interactive)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project' },
    } as any)
    vi.mocked(api.projects.applyImportPlan).mockResolvedValue({} as any)
    vi.mocked(api.projects.commitImportPlan).mockResolvedValue({} as any)
  })

  it('auto-applies the single plan in agent mode and does not commit', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [plan('only')] } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'plan-id': undefined, 'force': false } })

    await ImportApplyCommand.prototype.run.call(ctx as any)

    expect(api.projects.applyImportPlan).toHaveBeenCalledWith('only')
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })

  it('targets the plan named by --plan-id when several exist', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b'), plan('c')],
    } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'plan-id': 'b', 'force': false } })

    await ImportApplyCommand.prototype.run.call(ctx as any)

    expect(api.projects.applyImportPlan).toHaveBeenCalledWith('b')
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })

  it('fails with exit 1 when the selection is ambiguous and no --plan-id is given', async () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({
      data: [plan('a'), plan('b')],
    } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'plan-id': undefined, 'force': false } })

    await expect(ImportApplyCommand.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')
    expect(ctx.style.fatal).toHaveBeenCalledWith(expect.stringContaining('--plan-id'))
    expect(api.projects.applyImportPlan).not.toHaveBeenCalled()
  })

  it('applies without committing in interactive mode when --force is given', async () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    vi.mocked(api.projects.findImportPlans).mockResolvedValue({ data: [plan('only')] } as any)
    const ctx = createCommandContext({ flags: { 'config': undefined, 'plan-id': 'only', 'force': true } })

    await ImportApplyCommand.prototype.run.call(ctx as any)

    expect(api.projects.applyImportPlan).toHaveBeenCalledWith('only')
    expect(api.projects.commitImportPlan).not.toHaveBeenCalled()
  })
})
