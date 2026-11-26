import { describe, expect, it, vi } from 'vitest'

import { Diagnostic, Diagnostics, ErrorDiagnostic, WarningDiagnostic } from '../../constructs/diagnostics.js'
import { Project } from '../../constructs/project.js'
import Validate from '../validate.js'
import { createCommandContext } from './helpers/command-context.js'

function projectReporting (diagnostic: Diagnostic) {
  const project = new Project('my-project', { name: 'My Project' })
  vi.spyOn(project, 'validate').mockImplementation(diagnostics => {
    diagnostics.add(diagnostic)
    return Promise.resolve()
  })
  return project
}

function callOrder (mock: any): number {
  return mock.mock.invocationCallOrder[0]
}

// oclif holds back all output while a spinner runs and prints it after the
// spinner's status line, so the spinner has to stop before the diagnostics
// print for the blank separator line to come between the two.
describe('validateProject output order', () => {
  it('stops the spinner before printing the warnings of a valid project', async () => {
    const ctx = createCommandContext({ command: Validate })
    const warning = new WarningDiagnostic({ title: 'Check has no location', message: 'Set one.' })

    await (ctx as any).validateProject(projectReporting(warning), { configDiagnostics: new Diagnostics() })

    expect(ctx.style.diagnostics).toHaveBeenCalled()
    expect(callOrder(ctx.style.actionSuccess)).toBeLessThan(callOrder(ctx.style.diagnostics))
    expect(ctx.exitCodeValue).toBeUndefined()
  })

  it('stops the spinner before printing the errors of an invalid project', async () => {
    const ctx = createCommandContext({ command: Validate })
    const error = new ErrorDiagnostic({ title: 'Invalid property value', message: 'Too high.', error: undefined })

    await expect((ctx as any).validateProject(projectReporting(error), {
      configDiagnostics: new Diagnostics(),
      failureMessage: 'Your project is not valid.',
    })).rejects.toThrow('EXIT_1')

    expect(callOrder(ctx.style.actionFailure)).toBeLessThan(callOrder(ctx.style.diagnostics))
    expect(callOrder(ctx.style.diagnostics)).toBeLessThan(callOrder(ctx.style.shortError))
    expect(ctx.style.actionSuccess).not.toHaveBeenCalled()
  })
})
