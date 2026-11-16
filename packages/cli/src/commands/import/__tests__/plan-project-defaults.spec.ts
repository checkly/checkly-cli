import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Session } from '../../../constructs/session.js'
import ImportPlanCommand from '../plan.js'
import { createCommandContext } from '../../__tests__/helpers/command-context.js'

// `checkly import` generates code to live in the loaded project, so a check
// prop the project's `checks` defaults supply is left out of the construct.
describe('import plan code generation', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'import-plan-defaults-'))
    Session.reset()
  })

  afterEach(async () => {
    Session.reset()
    await rm(directory, { recursive: true, force: true })
  })

  it('generates against the loaded project\'s check defaults', async () => {
    Session.checkDefaults = { muted: true }

    const planFile = path.join(directory, 'plan.json')
    await writeFile(planFile, JSON.stringify({
      id: 'plan',
      changes: {
        resources: [{
          type: 'check',
          logicalId: 'homepage',
          physicalId: 'homepage',
          payload: {
            id: 'homepage',
            checkType: 'URL',
            name: 'Homepage',
            muted: true,
            activated: true,
            frequency: 10,
            request: { url: 'https://www.example.com' },
          },
        }],
      },
    }))

    const root = path.join(directory, 'out')
    const ctx = createCommandContext({
      command: ImportPlanCommand,
      parsed: {
        argv: [],
        flags: {
          'config': undefined,
          root,
          'preview': false,
          'debug-import-plan': false,
          'debug-import-plan-input-file': planFile,
          'debug-import-plan-output-file': path.join(directory, 'unused.json'),
        },
      },
    })

    // The command keeps private methods, which need a real instance; the
    // context's mocks (parse, output, style) are laid over it.
    const command = new ImportPlanCommand([], {} as any)
    for (const name of ['parse', 'log', 'logToStderr', 'exit', 'error', 'style'] as const) {
      Object.defineProperty(command, name, { value: ctx[name], writable: true })
    }
    await command.run()

    const source = await readFile(path.join(root, 'resources/url-monitors/homepage.check.ts'), 'utf8')
    expect(source).toContain('new UrlMonitor(\'homepage\', {')
    // The row's value is the project default: left out.
    expect(source).not.toContain('muted')
    // A project without the default would spell out `activated` only when it
    // differs from the backend's; it does not.
    expect(source).not.toContain('activated')
  })
})
