// create test for checkly env add
import * as path from 'path'
import config from 'config'
import { nanoid } from 'nanoid'
import { runChecklyCli } from '../../run-checkly'

const executionId = nanoid(5)

async function cleanupEnvVars () {
  await runChecklyCli({
    args: ['env', 'rm', `testenvvarsrm-${executionId}`, '--force'],
    apiKey: config.get('apiKey'),
    accountId: config.get('accountId'),
    directory: path.join(__dirname, '../fixtures/check-parse-error'),
  })
}

describe('checkly env rm', () => {
  beforeEach(async () => {
    await runChecklyCli({
      args: ['env', 'add', `testenvvarsrm-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })
  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await cleanupEnvVars()
  })

  it('should remove the testenvvarsrm env variable', async () => {
    const result = await runChecklyCli({
      args: ['env', 'rm', `testenvvarsrm-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain(`Environment variable testenvvarsrm-${executionId} deleted.`)
  })

  it('should ask for permision to remove the testenvvarsrm env variable', async () => {
    const result = await runChecklyCli({
      args: ['env', 'rm', `testenvvarsrm-${executionId}`],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
      timeout: 5000,
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain('Are you sure you want to delete environment variable')
  })

  it('should throw an error because testenvvarsrm env variable does not exist', async () => {
    await cleanupEnvVars()
    const result = await runChecklyCli({
      args: ['env', 'rm', `testenvvarsrm-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' does not exist
    expect(result.stderr).toContain(`Environment variable testenvvarsrm-${executionId} does not exist.`)
  })
})
