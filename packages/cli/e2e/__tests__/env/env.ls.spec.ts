import path from 'node:path'

import config from 'config'
import { nanoid } from 'nanoid'
import { describe, beforeAll, afterAll, it, expect } from 'vitest'

import { runChecklyCli } from '../../run-checkly'

describe('checkly env ls', () => {
  const executionId = nanoid(5)

  // before testing add a new environment variable vi checkly env add test true
  beforeAll(async () => {
    await runChecklyCli({
      args: ['env', 'add', `testenvvarsls-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  // after testing remove the environment variable vi checkly env rm test
  afterAll(async () => {
    await runChecklyCli({
      args: ['env', 'rm', `testenvvarsls-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  it('should list all environment variables', async () => {
    const result = await runChecklyCli({
      args: ['env', 'ls'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain(`testenvvarsls-${executionId}`)
  })
})
