// create test for checkly env ls
import * as path from 'path'
import * as config from 'config'
import { nanoid } from 'nanoid'
import { runChecklyCli } from '../../run-checkly'

describe('checkly env ls', () => {
  const executionId = nanoid(5)

  // before testing add a new environment variable vi checkly env add test true
  beforeAll(() => {
    runChecklyCli({
      args: ['env', 'add', `testenvvarsls-${executionId}`, 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  // after testing remove the environment variable vi checkly env rm test
  afterAll(() => {
    runChecklyCli({
      args: ['env', 'rm', `testenvvarsls-${executionId}`, '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  it('should list all environment variables', () => {
    const result = runChecklyCli({
      args: ['env', 'ls'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
    // expect that 'testenvvars' is in the output
    expect(result.stdout).toContain(`testenvvarsls-${executionId}`)
  })
})
