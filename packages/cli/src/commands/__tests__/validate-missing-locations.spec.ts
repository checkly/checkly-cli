import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  runtimes: { getAll: vi.fn().mockResolvedValue([]) },
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
}))

import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { parseProject } from '../../services/project-parser.js'
import { ApiCheck } from '../../constructs/api-check.js'
import { Diagnostic, Diagnostics } from '../../constructs/diagnostics.js'
import { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import Validate from '../validate.js'
import { createCommandContext as createSharedCommandContext } from './helpers/command-context.js'

function createCommandContext () {
  return createSharedCommandContext({
    command: Validate,
    parsed: { flags: { 'config': undefined, 'verify-runtime-dependencies': true } },
    members: { account: { name: 'Test Account', runtimeId: 'runtime-default' } },
  })
}

describe('checkly validate', () => {
  afterEach(() => {
    Session.reset()
  })

  it('warns about a check without a location, and still reports the project as valid', async () => {
    vi.mocked(loadChecklyConfig).mockResolvedValue({
      config: { logicalId: 'my-project', projectName: 'My Project' },
      constructs: [],
      diagnostics: new Diagnostics(),
    } as any)
    Session.reset()
    const project = new Project('my-project', { name: 'My Project' })
    Session.project = project
    // parseProject is mocked, so the option it is called with does not reach
    // the Session; set it the way parseProject would.
    Session.warnOnMissingCheckLocations = true
    new ApiCheck('api', { name: 'API', request: { url: 'https://example.com', method: 'GET' } })
    vi.mocked(parseProject).mockResolvedValue(project)
    const ctx = createCommandContext()

    await Validate.prototype.run.call(ctx as any)

    expect(parseProject).toHaveBeenCalledWith(expect.objectContaining({ warnOnMissingCheckLocations: true }))
    const [diagnostics] = vi.mocked(ctx.style.diagnostics).mock.calls[0]
    expect(diagnostics.isFatal()).toBe(false)
    expect(diagnostics.observations.map((observation: Diagnostic) => observation.title))
      .toContain('[ApiCheck:api] Check has no location')
    expect(ctx.exitCodeValue).toBeUndefined()
    expect(ctx.style.shortSuccess).toHaveBeenCalledWith('Your project is valid.')
  })
})
