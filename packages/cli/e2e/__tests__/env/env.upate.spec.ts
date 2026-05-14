import path from 'node:path'

import { nanoid } from 'nanoid'
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'

import { FixtureSandbox } from '../../../src/testing/fixture-sandbox'
import { runCheckly } from '../../run-checkly'

const executionId = nanoid(5)

let fixt: FixtureSandbox

describe('checkly env update', () => {
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
    // create a env variable to update testenvvarsUpdate
    await runCheckly(fixt, ['env', 'add', `testenvvarsUpdate-${executionId}`, 'testvalue'])
  })

  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await runCheckly(fixt, ['env', 'rm', `testenvvarsUpdate-${executionId}`, '--force']).catch(() => {})
  })

  it('should update a env variable called testenvvarsUpdate', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'update', `testenvvarsUpdate-${executionId}`, 'testvalue'])
    // expect that 'testenvvarsUpdate' is in the output
    expect(stdout).toContain(`Environment variable "testenvvarsUpdate-${executionId}" updated.`)
  })
})
