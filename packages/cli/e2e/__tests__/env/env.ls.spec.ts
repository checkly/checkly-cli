// create test for checkly env ls
import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../../run-checkly'

describe('checkly env ls', () => {
  // before testing add a new environment variable vi checkly env add test true
  beforeAll(() => {
    const result = runChecklyCli({
      args: ['env', 'add', 'testenvvarsls', 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, '../fixtures/check-parse-error'),
    })
  })

  // after testing remove the environment variable vi checkly env rm test
  afterAll(() => {
    const result = runChecklyCli({
      args: ['env', 'rm', 'testenvvarsls', '--force'],
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
    expect(result.stdout).toContain('testenvvarsls')
  })
})
