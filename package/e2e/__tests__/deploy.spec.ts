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
  const { data: projects } = await projectsApi.getAll()
  for (const project of projects) {
    const matchesLogicalId = project.logicalId === projectLogicalId
    // Also delete any old projects that may have been missed in previous e2e tests
    const leftoverE2eProject = project.name.startsWith('e2e-test-deploy-project-') &&
      DateTime.fromISO(project.created_at) < DateTime.now().minus(Duration.fromObject({ minutes: 10 }))
    if (matchesLogicalId || leftoverE2eProject) {
      await projectsApi.deleteProject(project.id)
    }
  }
}

describe('deploy', () => {
  // Create a unique ID suffix to support parallel test executions
  const projectLogicalId = `e2e-test-deploy-project-${uuidv4()}`
  // Cleanup projects that may have not been deleted in previous runs
  beforeAll(() => cleanupProjects())
  // Clean up by deleting the project
  afterAll(() => cleanupProjects(projectLogicalId))

  it('Simple project should deploy successfully', () => {
    const result = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/deploy-project'),
      env: { PROJECT_LOGICAL_ID: projectLogicalId },
    })
    expect(result.stderr).toBe('')
  })
})
