import * as path from 'path'
import * as config from 'config'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { runChecklyCli } from '../run-checkly'
import Projects from '../../src/rest/projects'
import { DateTime, Duration } from 'luxon'

async function cleanupProjects (projectLogicalId?: string) {
  const baseURL: string = config.get('baseURL')
  const accountId: string = config.get('accountId')
  const apiKey: string = config.get('apiKey')
  // Why create an axios client rather than using the one in rest/api?
  // The rest/api client is configured based on the NODE_ENV and CLI config file, which isn't suitable for e2e tests.
  const api = axios.create({
    baseURL,
    headers: {
      'x-checkly-account': accountId,
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const projectsApi = new Projects(api)
  if (projectLogicalId) {
    await projectsApi.deleteProject(projectLogicalId)
    return
  }
  const { data: projects } = await projectsApi.getAll()
  for (const project of projects) {
    // Also delete any old projects that may have been missed in previous e2e tests
    const leftoverE2eProject = project.name.startsWith('e2e-test-deploy-project-') &&
      DateTime.fromISO(project.created_at) < DateTime.now().minus(Duration.fromObject({ minutes: 20 }))
    if (leftoverE2eProject) {
      await projectsApi.deleteProject(project.logicalId)
    }
  }
}

describe('deploy', () => {
  // Create a unique ID suffix to support parallel test executions
  let projectLogicalId: string
  // Cleanup projects that may have not been deleted in previous runs
  beforeAll(() => cleanupProjects())
  beforeEach(() => {
    projectLogicalId = `e2e-test-deploy-project-${uuidv4()}`
  })
  // Clean up by deleting the project
  afterEach(() => cleanupProjects(projectLogicalId))
  afterAll(() => cleanupProjects())

  it('Simple project should deploy successfully (version v4.0.8)', () => {
    const { status, stderr } = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      cliVersion: '4.0.8',
    })
    expect(status).toBe(0)
    expect(stderr).toBe('')
  })

  it('Simple project should deploy successfully (version after v4.0.8)', () => {
    const { status, stderr } = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
      cliVersion: '4.0.9',
    })
    expect(status).toBe(0)
    expect(stderr).toBe('')
  })

  it('Simple esm project should deploy successfully', () => {
    const { status, stderr } = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-esm-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(stderr).toBe('')
    expect(status).toBe(0)
  })

  it('Should mark testOnly check as skipped', () => {
    const { status, stdout } = runChecklyCli({
      args: ['deploy', '--preview'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-only-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId, TEST_ONLY: 'true' },
    })
    expect(stdout).toContain(
`Create:
    ApiCheck: not-testonly-default-check
    ApiCheck: not-testonly-false-check

Skip (testOnly):
    ApiCheck: testonly-true-check
`)
    expect(status).toBe(0)
  })

  it('Should mark testOnly check as deleted if there is a deletion', () => {
    // Deploy a check (testOnly=false)
    runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-only-project'),
      env: { TEST_ONLY: 'false', PROJECT_LOGICAL_ID: projectLogicalId },
    })
    // Deploy a check (testOnly=true)
    const { status, stdout } = runChecklyCli({
      args: ['deploy', '--force', '--output'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-only-project'),
      env: { TEST_ONLY: 'true', PROJECT_LOGICAL_ID: projectLogicalId },
    })
    // Moving the check to testOnly causes it to be deleted.
    // The check should only be listed under "Delete" and not "Skip".
    expect(stdout).toContain(
`Delete:
    Check: testonly-true-check

Update and Unchanged:
    ApiCheck: not-testonly-default-check
    ApiCheck: not-testonly-false-check`)
    expect(status).toBe(0)
  })

  it('Should deploy with different config file', () => {
    const resultOne = runChecklyCli({
      args: ['deploy', '--preview'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    const resultTwo = runChecklyCli({
      args: ['deploy', '--preview', '--config', 'checkly.staging.config.ts'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(resultOne.status).toBe(0)
    expect(resultTwo.status).toBe(0)
    expect(resultOne.stdout).not.toEqual(resultTwo.stdout)
  })

  it('Should terminate when no resources are found', () => {
    const result = runChecklyCli({
      args: ['deploy'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'empty-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(result.stderr).toContain('Failed to deploy your project. Unable to find constructs to deploy.')
    expect(result.status).toBe(1)
  })
})
