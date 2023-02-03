import * as path from 'path'
import * as uuid from 'uuid'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('test', () => {
  it('Test project should run successfully', () => {
    const secretEnv = uuid.v4()
    const result = runChecklyCli({
      args: ['test', '-e', `SECRET_ENV=${secretEnv}`],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-project'),
    })
    expect(result.stdout).toContain(secretEnv)
    expect(result.status).not.toBe(0)
  })

  it('Should terminate when no checks are found', () => {
    const result = runChecklyCli({
      args: ['test', 'does-not-exist.js'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/test-project'),
      timeout: 5000,
    })
    console.log('Received ', result)
    expect(result.status).toBe(0)
  })
})
