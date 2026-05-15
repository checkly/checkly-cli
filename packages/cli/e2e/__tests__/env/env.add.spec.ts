import path from 'node:path'

import { nanoid } from 'nanoid'
import { ExecaError } from 'execa'
import { describe, beforeAll, afterAll, afterEach, it, expect } from 'vitest'

import { FixtureSandbox } from '../../../src/testing/fixture-sandbox'
import { runCheckly } from '../../run-checkly'

const executionId = nanoid(5)

let fixt: FixtureSandbox

async function cleanupEnvVars () {
  await Promise.all([
    runCheckly(fixt, ['env', 'rm', `testenvvars-${executionId}`, '--force']).catch(() => {}),
    runCheckly(fixt, ['env', 'rm', `testenvvarslocked-${executionId}`, '--force']).catch(() => {}),
  ])
}

describe('checkly env add', () => {
  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      template: 'bare',
      source: path.join(__dirname, '..', 'fixtures', 'check-parse-error'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await cleanupEnvVars()
  })

  it('should add a new env variable called testenvvars', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'add', `testenvvars-${executionId}`, 'testvalue'])
    expect(stdout).toContain(`Environment variable "testenvvars-${executionId}" added.`)
  })

  it('should add a new locked env variable called testenvvars', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'])
    expect(stdout).toContain(`Environment variable "testenvvarslocked-${executionId}" added.`)
  })

  it('should add fail because env variable called testenvvars exists', async () => {
    await runCheckly(fixt, ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'], {
      timeout: 10000,
    })
    try {
      await runCheckly(fixt, ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'], {
        timeout: 10000,
      })
      expect.unreachable('Expected env add to fail because variable already exists')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.stdout).toContain(`Environment variable "testenvvarslocked-${executionId}" already exists.`)
      } else {
        throw err
      }
    }
  })
})
