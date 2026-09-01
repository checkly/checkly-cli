import { describe, expect, it, vi } from 'vitest'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

vi.mock('../../services/checkly-config-loader', () => ({
  loadChecklyConfig: vi.fn(),
}))

vi.mock('../../services/project-parser', () => ({
  parseProject: vi.fn(),
}))

vi.mock('../../services/util', () => ({
  splitConfigFilePath: vi.fn().mockReturnValue({
    configDirectory: '.',
    configFilenames: ['checkly.config.ts'],
  }),
  getGitInformation: vi.fn(),
}))

import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { parseProject } from '../../services/project-parser.js'
import { ConfigFileDiagnostics } from '../../services/config-diagnostics.js'
import { Diagnostics, ErrorDiagnostic, WarningDiagnostic } from '../../constructs/diagnostics.js'
import { CommandStyle } from '../../helpers/command-style.js'
import { AuthCommand } from '../authCommand.js'
import Deploy from '../deploy.js'

function createCommandContext (parsed: unknown) {
  let exitCodeValue: number | undefined
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    style: {
      outputFormat: undefined,
      diagnostics: CommandStyle.prototype.diagnostics,
      actionStart: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      longError: vi.fn(),
      longWarning: vi.fn(),
      longInfo: vi.fn(),
      shortError: vi.fn(),
    },
    validateProject: (AuthCommand.prototype as any).validateProject,
    constructor: Deploy,
    account: { name: 'Test Account', runtimeId: 'runtime-default' },
    get exitCodeValue () {
      return exitCodeValue
    },
  }
}

const deployFlags = {
  flags: {
    'force': true,
    'preview': true,
    'output': false,
    'verbose': false,
    'config': undefined,
    'schedule-on-deploy': true,
    'verify-runtime-dependencies': true,
    'debug-bundle': false,
    'debug-bundle-output-file': './debug-bundle.json',
  },
  metadata: { flags: {} },
}

describe('deploy config diagnostics', () => {
  it('renders config diagnostics ahead of project diagnostics', async () => {
    const configDiagnostics = new ConfigFileDiagnostics('checkly.config.ts')
    configDiagnostics.add(new WarningDiagnostic({
      title: 'Config warning',
      message: 'A config-level warning.',
    }))
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: {
        logicalId: 'my-project',
        projectName: 'My Project',
        checks: {},
      },
      constructs: [],
      diagnostics: configDiagnostics,
    } as any)

    const project = {
      repoUrl: undefined,
      validate: vi.fn((diagnostics: Diagnostics) => {
        diagnostics.add(new ErrorDiagnostic({
          title: 'Project error',
          message: 'A project-level error.',
          error: new Error('A project-level error.'),
        }))
        return Promise.resolve()
      }),
    }
    vi.mocked(parseProject).mockResolvedValue(project as any)

    const ctx = createCommandContext(deployFlags)

    await expect(Deploy.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_1')

    expect(ctx.style.longWarning).toHaveBeenCalledWith(
      '[checkly.config.ts] Config warning',
      'A config-level warning.',
    )
    expect(ctx.style.longError).toHaveBeenCalledWith('Project error', 'A project-level error.')

    // Config diagnostics must render before project diagnostics.
    const warningOrder = ctx.style.longWarning.mock.invocationCallOrder[0]
    const errorOrder = ctx.style.longError.mock.invocationCallOrder[0]
    expect(warningOrder).toBeLessThan(errorOrder)

    expect(ctx.exitCodeValue).toBe(1)
  })
})
