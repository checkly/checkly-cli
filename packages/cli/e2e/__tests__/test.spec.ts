import * as path from 'path'
import * as uuid from 'uuid'
import * as config from 'config'
import * as fs from 'fs'
import { runChecklyCli } from '../run-checkly'

describe('test', () => {
  it('Test project should run successfully', () => {
    const secretEnv = uuid.v4()
    const result = runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`, '--verbose'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).not.toContain('File extension type example')
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).toBe(0)
  })

  it('Should include only one check', () => {
    const result = runChecklyCli({
      args: ['test', 'secret.check.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Show SECRET_ENV value')
    expect(result.stdout).toContain('1 passed, 1 total')
    expect(result.status).toBe(0)
  })

  it('Should use different config file', () => {
    const result = runChecklyCli({
      args: ['test', 'secret.check.ts', '--config', 'checkly.staging.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Show SECRET_ENV value')
    expect(result.stdout).toContain('1 passed, 1 total')
    expect(result.status).toBe(0)
  })

  it('Should fail with config file not found', () => {
    const result = runChecklyCli({
      args: ['test', 'secret.check.ts', '--config', 'checkly.notfound.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.status).toBe(1)
  })

  it('Should terminate when no checks are found', () => {
    const result = runChecklyCli({
      args: ['test', 'does-not-exist.js'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(result.stdout).toContain('Unable to find checks to run using [FILEARGS]=\'')
    expect(result.status).toBe(0)
  })

  it('Should terminate with error when JS/TS throws error', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-parse-error'),
    })
    expect(result.stderr).toContain('Error loading file')
    expect(result.stderr).toContain('Error: Big bang!')
    expect(result.status).toBe(1)
  })

  it('Should terminate with error when duplicated logicalId', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-duplicated-groups'),
    })
    expect(result.stderr.replace(/(\n {4})/gm, ''))
      .toContain("Error: Resource of type 'groups' with logical id 'my-check-group' already exists.")
    expect(result.status).toBe(1)
  })

  it('Should include a testOnly check', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-only-project'),
    })
    expect(result.stdout).toContain('TestOnly=false (default) Check')
    expect(result.stdout).toContain('TestOnly=false Check')
    expect(result.stdout).toContain('TestOnly=true Check')
    expect(result.status).toBe(0)
  })

  it('Should use Github reporter', () => {
    const reportFilename = './reports/checkly-summary.md'
    try {
      fs.unlinkSync(reportFilename)
    } catch {
    }
    const result = runChecklyCli({
      args: ['test', '--reporter', 'github'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-project'),
      env: { CHECKLY_REPORTER_GITHUB_OUTPUT: reportFilename },
    })
    expect(result.stdout).toContain('Github summary saved in')
    expect(fs.existsSync(path.join(__dirname, 'fixtures', 'test-project', reportFilename))).toBe(true)
    expect(result.status).toBe(0)
  })
})
