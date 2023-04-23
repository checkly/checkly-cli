// create test for checkly env add
import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../../run-checkly'

function cleanupEnvVars () {
  runChecklyCli({
    args: ['env', 'rm', 'testenvvars', '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
  runChecklyCli({
    args: ['env', 'rm', 'testenvvarslocked', '--force'],
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
      args: ['env', 'add', 'testenvvars', 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain('Environment variable testenvvars added.')
  })

  it('should add a new locked env variable called testenvvars', () => {
    const result = runChecklyCli({
      args: ['env', 'add', 'testenvvarslocked', 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain('Environment variable testenvvarslocked added.')
  })

  it('should add fail because env variable called testenvvars exists', () => {
    runChecklyCli({
      args: ['env', 'add', 'testenvvarslocked', 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    const result = runChecklyCli({
      args: ['env', 'add', 'testenvvarslocked', 'testvalue', '--locked'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stderr).toContain('Environment variable testenvvarslocked already exists.')
  })
})
