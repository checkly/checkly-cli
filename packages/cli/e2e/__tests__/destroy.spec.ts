import path from 'node:path'

import { ExecaError } from 'execa'
import { v4 as uuidv4 } from 'uuid'
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('destroy', () => {
  let fixt: FixtureSandbox
  let projectLogicalId: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'deploy-project'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  // Cleanup projects that may have not been deleted in previous runs
  beforeEach(() => {
    projectLogicalId = `e2e-test-deploy-project-${uuidv4()}`
  })

  it('Should be destroyed successfully', async () => {
    const { stdout } = await runCheckly(fixt, ['destroy', '--force'], {
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(stdout).toContain('All resources associated with project "Deploy Project" have been successfully deleted.')
  })

  it('Should ask to confirm before destroy', async () => {
    try {
      await runCheckly(fixt, ['destroy'], {
        env: { PROJECT_LOGICAL_ID: projectLogicalId },
        timeout: 10000,
      })
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.stdout).toContain('Type the project name "Deploy Project" to confirm:')
      } else {
        throw err
      }
    }
  })

  it('Shouldn fail confirming to destroy', async () => {
    const wrongProjectName = 'Wrong Project Name'
    const { stdout } = await runCheckly(fixt, ['destroy'], {
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      promptsInjection: [wrongProjectName],
    })
    expect(stdout).toContain(`The entered project name "${wrongProjectName}" doesn't match the expected project name`)
  })

  it('Should destroy after success confirmation', async () => {
    const { stdout } = await runCheckly(fixt, ['destroy'], {
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      promptsInjection: ['Deploy Project'],
    })
    expect(stdout).toContain('All resources associated with project "Deploy Project" have been successfully deleted.')
  })

  it('Should be destroyed using different config file', async () => {
    const { stdout } = await runCheckly(fixt, ['destroy', '--force', '--config', 'checkly.staging.config.ts'], {
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(stdout).toContain('All resources associated with project "Deploy Staging Project" have been successfully deleted.')
  })

  it('Should fail with config file not found', async () => {
    try {
      await runCheckly(fixt, ['destroy', '--force', '--config', 'checkly.notfound.config.ts'], {
        env: { PROJECT_LOGICAL_ID: projectLogicalId },
      })
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).toBe(1)
      } else {
        throw err
      }
    }
  })
})
