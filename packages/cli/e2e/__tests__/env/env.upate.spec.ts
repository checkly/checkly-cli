// create test for checkly env update
import * as path from 'path'
import * as config from 'config'
import { nanoid } from 'nanoid'
import { runChecklyCli } from '../../run-checkly'

const executionId = nanoid(5)

function cleanupEnvVars () {
  runChecklyCli({
    args: ['env', 'rm', `testenvvarsUpdate-${executionId}`, '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
  runChecklyCli({
    args: ['env', 'rm', `testenvvarsUpdatelocked-${executionId}`, '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
}

describe('checkly env update', () => {
  beforeEach(() => {
    // create a env variable to update testenvvarsUpdate
    runChecklyCli({
      args: ['env', 'add', `testenvvarsUpdate-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })
  // after testing remove the environment variable vi checkly env rm test
  afterEach(() => {
    cleanupEnvVars()
  })

  it('should update a env variable called testenvvarsUpdate', () => {
    const result = runChecklyCli({
      args: ['env', 'update', `testenvvarsUpdate-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvarsUpdate' is in the output
    expect(result.stdout).toContain(`Environment variable testenvvarsUpdate-${executionId} updated.`)
  })
})
