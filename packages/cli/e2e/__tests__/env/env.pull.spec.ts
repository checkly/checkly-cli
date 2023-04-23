// create test for checkly env add
import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../../run-checkly'
import * as fs from 'fs'

describe('checkly env pull', () => {
  const directory = path.join(__dirname, '../fixtures/check-parse-error')
  // before testing add a new environment variable call envPullTest with value testvalue
  // additionally delete .envPullTest file if it exists
  beforeAll(() => {
    const result = runChecklyCli({
      args: ['env', 'add', 'envPullTest', 'testvalue'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory,
    })

    // goto checkly path and delete .envPullTest file if it exists
    if (fs.existsSync(path.join(directory, '.envPullTest'))) {
      fs.unlinkSync(path.join(directory, '.envPullTest'))
    }
  })

  // after testing remove the environment variable envPullTest from checkly
  // additionally delete .envPullTest file if it exists
  afterAll(() => {
    const result = runChecklyCli({
      args: ['env', 'rm', 'envPullTest'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory,
    })

    if (fs.existsSync(path.join(directory, '.envPullTest'))) {
      fs.unlinkSync(path.join(directory, '.envPullTest'))
    }
  })
  // test that env pull .envPullTest creates a .envPullTest file with the correct content
  it('should create a .envPullTest file with the correct content', () => {
    const result = runChecklyCli({
      args: ['env', 'pull', '.envPullTest'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory,
    })
    // expect that 'testenvvars' is in the output
    expect(fs.existsSync(path.join(directory, '.envPullTest'))).toBe(true)
    expect(fs.readFileSync(path.join(directory, '.envPullTest'), 'utf8')).toContain('envPullTest=testvalue')
    // result.stdout contains Success! ${filename} file
    expect(result.stdout).toContain('Success! .envPullTest file created')
  })

  it('should ask for permission to overwrite a .envPullTest file', () => {
    // create .envPullTest file in directory
    fs.writeFileSync(path.join(directory, '.envPullTest'), 'test=test')
    const result = runChecklyCli({
      args: ['env', 'pull', '.envPullTest'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory,
    })
    // result.stdout contains Success! ${filename} file
    expect(result.stdout).toContain('Found existing file .envPullTest. Do you want to overwrite?')
  })

  it('should overwrite a .envPullTest file w/o asking for permission', () => {
    // create .envPullTest file in directory
    fs.writeFileSync(path.join(directory, '.envPullTest'), 'test=test')
    const result = runChecklyCli({
      args: ['env', 'pull', '.envPullTest', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory,
    })
    // result.stdout contains Success! ${filename} file
    expect(result.stdout).toContain('Success! .envPullTest file updated')
  })
})
