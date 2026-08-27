import { describe, expect, it, vi } from 'vitest'

vi.mock('../../services/checkly-config-loader', async importOriginal => {
  // Keep the real ConfigNotFoundError so instanceof checks work.
  const actual = await importOriginal<typeof import('../../services/checkly-config-loader.js')>()
  return {
    ...actual,
    loadChecklyConfig: vi.fn(),
  }
})

vi.mock('../../services/util', () => ({
  splitConfigFilePath: vi.fn().mockReturnValue({
    configDirectory: '.',
    configFilenames: ['checkly.config.ts'],
  }),
  getEnvs: vi.fn().mockResolvedValue({}),
  getGitInformation: vi.fn(),
  getCiInformation: vi.fn(),
}))

import { loadChecklyConfig, ConfigNotFoundError } from '../../services/checkly-config-loader.js'
import { ConfigFileDiagnostics, InvalidConfigError } from '../../services/config-diagnostics.js'
import { ErrorDiagnostic } from '../../constructs/diagnostics.js'
import Trigger from '../trigger.js'

// The harness stops the run right after the config-load step, which is the
// behavior under test: which load failures are tolerated and which abort.
class StopError extends Error {}

function createCommandContext () {
  return {
    parse: vi.fn().mockResolvedValue({
      flags: {
        'config': undefined,
        'env': [],
        'env-file': undefined,
        'reporter': undefined,
        'retries': undefined,
        'detach': false,
      },
    }),
    style: {
      diagnostics: vi.fn(),
    },
    prepareRunLocation: vi.fn(() => {
      throw new StopError('reached run preparation')
    }),
    constructor: Trigger,
  }
}

describe('trigger config-load failures', () => {
  it('tolerates a missing config file', async () => {
    vi.mocked(loadChecklyConfig).mockRejectedValue(
      new ConfigNotFoundError(['.'], ['checkly.config.ts']),
    )
    const ctx = createCommandContext()

    // Reaching run preparation means the missing config was swallowed.
    await expect(Trigger.prototype.run.call(ctx as any)).rejects.toThrow(StopError)
  })

  it('tolerates a config that fails to load', async () => {
    vi.mocked(loadChecklyConfig).mockRejectedValue(
      new Error(`Error loading file 'checkly.config.ts'`),
    )
    const ctx = createCommandContext()

    await expect(Trigger.prototype.run.call(ctx as any)).rejects.toThrow(StopError)
  })

  it('fails on an invalid config', async () => {
    const diagnostics = new ConfigFileDiagnostics('checkly.config.ts')
    diagnostics.add(new ErrorDiagnostic({
      title: 'Missing required property',
      message: 'Property "logicalId" is required and must be set.',
      error: new Error('Property "logicalId" is required and must be set.'),
    }))
    vi.mocked(loadChecklyConfig).mockRejectedValue(new InvalidConfigError(diagnostics))
    const ctx = createCommandContext()

    await expect(Trigger.prototype.run.call(ctx as any)).rejects.toBeInstanceOf(InvalidConfigError)
    expect(ctx.prepareRunLocation).not.toHaveBeenCalled()
  })
})
