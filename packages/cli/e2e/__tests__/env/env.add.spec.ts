import path from 'node:path'

import config from 'config'
import { nanoid } from 'nanoid'
import { describe, afterEach, it, expect } from 'vitest'

import { runChecklyCli } from '../../run-checkly'

const executionId = nanoid(5)

function cleanupEnvVars () {
  return Promise.all([
    runChecklyCli({
      args: ['env', 'rm', `testenvvars-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    }),
    runChecklyCli({
      args: ['env', 'rm', `testenvvarslocked-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    }),
  ])
}

describe('checkly env add', () => {
  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await cleanupEnvVars()
  })

  it('should add a new env variable called testenvvars', async () => {
    const result = await runChecklyCli({
      args: ['env', 'add', `testenvvars-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    expect(result.stdout).toContain(`Environment variable "testenvvars-${executionId}" added.`)
  })

  it('should add a new locked env variable called testenvvars', async () => {
    const result = await runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    expect(result.stdout).toContain(`Environment variable "testenvvarslocked-${executionId}" added.`)
  })

  it('should add fail because env variable called testenvvars exists', async () => {
    await runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
      timeout: 10000,
    })
    const result = await runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
      timeout: 10000,
    })
    expect(result.stdout).toContain(`Environment variable "testenvvarslocked-${executionId}" already exists.`)
  })
})
