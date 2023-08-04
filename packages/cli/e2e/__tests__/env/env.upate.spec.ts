// create test for checkly env update
import * as path from 'path'
import * as config from 'config'
import { nanoid } from 'nanoid'
import { runChecklyCli } from '../../run-checkly'

jest.setTimeout(30000)

const executionId = nanoid(5)

describe('checkly env update', () => {
  beforeEach(async () => {
    // create a env variable to update testenvvarsUpdate
    await runChecklyCli({
      args: ['env', 'add', `testenvvarsUpdate-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })
  // after testing remove the environment variable vi checkly env rm test
  afterEach(async () => {
    await runChecklyCli({
      args: ['env', 'rm', `testenvvarsUpdate-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  it('should update a env variable called testenvvarsUpdate', async () => {
    const result = await runChecklyCli({
      args: ['env', 'update', `testenvvarsUpdate-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvarsUpdate' is in the output
    expect(result.stdout).toContain(`Environment variable testenvvarsUpdate-${executionId} updated.`)
  })
})
