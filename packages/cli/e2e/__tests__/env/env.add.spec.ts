// create test for checkly env add
import * as path from 'path'
import * as config from 'config'
import { nanoid } from 'nanoid'
import { runChecklyCli } from '../../run-checkly'

const executionId = nanoid(5)

function cleanupEnvVars () {
  runChecklyCli({
    args: ['env', 'rm', `testenvvars-${executionId}`, '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
  runChecklyCli({
    args: ['env', 'rm', `testenvvarslocked-${executionId}`, '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
}

describe('checkly env add', () => {
  beforeEach(() => {
    cleanupEnvVars()
  })
  // after testing remove the environment variable vi checkly env rm test
  afterEach(() => {
    cleanupEnvVars()
  })

  it('should add a new env variable called testenvvars', () => {
    const result = runChecklyCli({
      args: ['env', 'add', `testenvvars-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    expect(result.stdout).toContain(`Environment variable testenvvars-${executionId} added.`)
  })

  it('should add a new locked env variable called testenvvars', () => {
    const result = runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    expect(result.stdout).toContain(`Environment variable testenvvarslocked-${executionId} added.`)
  })

  it('should add fail because env variable called testenvvars exists', () => {
    runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    const result = runChecklyCli({
      args: ['env', 'add', `testenvvarslocked-${executionId}`, 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    expect(result.stderr).toContain(`Environment variable testenvvarslocked-${executionId} already exists.`)
  })
})
