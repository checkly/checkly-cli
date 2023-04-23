// create test for checkly env add
import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../../run-checkly'

function cleanupEnvVars () {
  runChecklyCli({
    args: ['env', 'rm', 'testenvvars'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
  runChecklyCli({
    args: ['env', 'rm', 'testenvvarslocked'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
}

describe('checkly env add', () => {
  beforeAll(() => {
    cleanupEnvVars()
  })
  // after testing remove the environment variable vi checkly env rm test
  afterAll(() => {
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
})
