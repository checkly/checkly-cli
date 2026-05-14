import path from 'node:path'

import { nanoid } from 'nanoid'
import { describe, beforeAll, afterAll, it, expect } from 'vitest'

import { FixtureSandbox } from '../../../src/testing/fixture-sandbox'
import { runCheckly } from '../../run-checkly'

describe('checkly env ls', () => {
  const executionId = nanoid(5)
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      template: 'bare',
      source: path.join(__dirname, '..', 'fixtures', 'check-parse-error'),
    })
    await runCheckly(fixt, ['env', 'add', `testenvvarsls-${executionId}`, 'testvalue'])
  }, 180_000)

  afterAll(async () => {
    try {
      await runCheckly(fixt, ['env', 'rm', `testenvvarsls-${executionId}`, '--force'])
    } catch {
      // ignore cleanup errors
    }
    await fixt?.destroy()
  })

  it('should list all environment variables', async () => {
    const { stdout } = await runCheckly(fixt, ['env', 'ls'])
    // expect that 'testenvvars' is in the output
    expect(stdout).toContain(`testenvvarsls-${executionId}`)
  })
})
