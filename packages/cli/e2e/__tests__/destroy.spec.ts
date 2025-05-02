import path from 'node:path'

import config from 'config'
import { v4 as uuidv4 } from 'uuid'
import { describe, it, expect, beforeEach } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('destroy', () => {
  let projectLogicalId: string
  // Cleanup projects that may have not been deleted in previous runs
  beforeEach(() => {
    projectLogicalId = `e2e-test-deploy-project-${uuidv4()}`
  })

  it('Should be destroyed successfully', async () => {
    const { status, stdout } = await runChecklyCli({
      args: ['destroy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(status).toBe(0)
    expect(stdout).toContain('All resources associated with project "Deploy Project" have been successfully deleted.')
  })

  it('Should ask to confirm before destroy', async () => {
    const result = await runChecklyCli({
      args: ['destroy'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      timeout: 10000,
    })
    expect(result.stdout).toContain('Please confirm by typing the project name "Deploy Project"')
  })

  it('Shouldn fail confirming to destroy', async () => {
    const wrongProjectName = 'Wrong Project Name'
    const result = await runChecklyCli({
      args: ['destroy'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      promptsInjection: [wrongProjectName],
    })
    expect(result.stdout).toContain(`The entered project name "${wrongProjectName}" doesn't match the expected project name`)
  })

  it('Should destroy after success confirmation', async () => {
    const result = await runChecklyCli({
      args: ['destroy'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      promptsInjection: ['Deploy Project'],
    })
    expect(result.stdout).toContain('All resources associated with project "Deploy Project" have been successfully deleted.')
  })

  it('Should be destroyed using different config file', async () => {
    const result = await runChecklyCli({
      args: ['destroy', '--force', '--config', 'checkly.staging.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('All resources associated with project "Deploy Staging Project" have been successfully deleted.')
  })

  it('Should fail with config file not found', async () => {
    const result = await runChecklyCli({
      args: ['destroy', '--force', '--config', 'checkly.notfound.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(result.status).toBe(1)
  })
})
