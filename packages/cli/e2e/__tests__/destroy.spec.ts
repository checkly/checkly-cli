import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'

describe('destroy', () => {
  it('Should be destroyed successfully', () => {
    const result = runChecklyCli({
      args: ['destroy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: 'deploy-project' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('All resources associated with project "Deploy Project" have been successfully deleted.')
  })

  it('Should confirm to continue with destroy', () => {
    const result = runChecklyCli({
      args: ['destroy'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: 'deploy-project' },
    })
    expect(result.status).toBe(null)
    expect(result.stdout).toContain('Please confirm by typing the project name "Deploy Project"')
  })

  it('Should be destroyed using different config file', () => {
    const result = runChecklyCli({
      args: ['destroy', '--force', '--config', 'checkly.staging.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: 'deploy-project' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('All resources associated with project "Deploy Staging Project" have been successfully deleted.')
  })

  it('Should fail with config file not found', () => {
    const result = runChecklyCli({
      args: ['destroy', '--force', '--config', 'checkly.notfound.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: 'deploy-project' },
    })
    expect(result.status).toBe(1)
  })
})
