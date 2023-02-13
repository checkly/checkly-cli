import * as path from 'path'
import * as uuid from 'uuid'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('test', () => {
  it('Test project should run successfully', () => {
    const secretEnv = uuid.v4()
    const result = runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`, '--verbose'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-project'),
    })
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).toBeNull()
  })

  it('Should terminate when no checks are found', () => {
    const result = runChecklyCli({
      args: ['test', 'does-not-exist.js'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-project'),
    })
    expect(result.status).toBe(0)
  })

  it('Should terminate with error when duplicated logicalId', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-duplicated-groups'),
    })
    expect(result.stderr.replace(/(\n {4})/gm, ''))
      .toContain("Error: Resource of type 'groups' with logical id 'my-check-group' is duplicated.")
    expect(result.status).toBe(1)
  })

  it('Should include a testOnly check', () => {
    const result = runChecklyCli({
      args: ['test'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-only-project'),
    })
    expect(result.stdout).toContain('TestOnly=false (default) Check')
    expect(result.stdout).toContain('TestOnly=false Check')
    expect(result.stdout).toContain('TestOnly=true Check')
    expect(result.status).toBe(0)
  })
})
