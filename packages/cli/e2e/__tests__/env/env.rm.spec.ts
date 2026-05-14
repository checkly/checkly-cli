import path from 'node:path'

import { nanoid } from 'nanoid'
import { ExecaError } from 'execa'
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'

import { FixtureSandbox } from '../../../src/testing/fixture-sandbox'
import { runCheckly } from '../../run-checkly'

const executionId = nanoid(5)

let fixt: FixtureSandbox

async function cleanupEnvVars () {
  await runCheckly(fixt, ['env', 'rm', `testenvvarsrm-${executionId}`, '--force']).catch(() => {})
}

describe('checkly env rm', () => {
  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      template: 'bare',
      source: path.join(__dirname, '..', 'fixtures', 'check-parse-error'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  beforeEach(async () => {
    await runCheckly(fixt, ['env', 'add', `testenvvarsrm-${executionId}`, 'testvalue'])
  })

  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await cleanupEnvVars()
  })

  it('should remove the testenvvarsrm env variable', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'rm', `testenvvarsrm-${executionId}`, '--force'])
    // expect that 'testenvvars' is in the output
    expect(stdout).toContain(`Environment variable "testenvvarsrm-${executionId}" deleted.`)
  })

  it('should ask for permision to remove the testenvvarsrm env variable', async () => {
    try {
      await runCheckly(fixt, ['env', 'rm', `testenvvarsrm-${executionId}`])
      expect.unreachable('Expected process to be killed by timeout')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.stdout).toContain(`Delete environment variable "testenvvarsrm-${executionId}"`)
        expect(err.stdout).toContain('Proceed?')
      } else {
        throw err
      }
    }
  })

  it('should throw an error because testenvvarsrm env variable does not exist', async () => {
    await cleanupEnvVars()
    try {
      await runCheckly(fixt, ['env', 'rm', `testenvvarsrm-${executionId}`, '--force'])
      expect.unreachable('Expected env rm to fail because variable does not exist')
    } catch (err) {
      if (err instanceof ExecaError) {
        // expect that 'testenvvars' does not exist
        expect(err.stdout).toContain(`Environment variable "testenvvarsrm-${executionId}" does not exist.`)
      } else {
        throw err
      }
    }
  })
})
