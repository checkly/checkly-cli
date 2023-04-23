// create test for checkly env add
import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../../run-checkly'

function cleanupEnvVars () {
  runChecklyCli({
    args: ['env', 'rm', 'testenvvarsrm'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
}

describe('checkly env rm', () => {
  beforeAll(() => {
    runChecklyCli({
      args: ['env', 'add', 'testenvvarsrm', 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })
  // after testing remove the environment variable vi checkly env rm test
  afterAll(() => {
    cleanupEnvVars()
  })

  it('should remove the testenvvarsrm env variable', () => {
    const result = runChecklyCli({
      args: ['env', 'rm', 'testenvvarsrm'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain('Environment variable testenvvarsrm deleted.')
  })

  it('should throw an error because testenvvarsrm env variable does not exist', () => {
    const result = runChecklyCli({
      args: ['env', 'rm', 'testenvvarsrm'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' does not exist
    expect(result.stderr).toContain('Environment variable testenvvarsrm does not exist.')
  })
})
