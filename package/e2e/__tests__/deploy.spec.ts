import * as path from 'path'
import * as config from 'config'
import { runChecklyCli } from '../run-checkly'
import axios from 'axios'
import Projects from '../../src/rest/projects'

async function deleteProject(projectLogicalId: string) {
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
  const project = projects.find(({ logicalId }) => logicalId === projectLogicalId)
  if (project) {
    await projectsApi.deleteProject(project.id)
  }
}

describe('deploy', () => {
  // Attempt to delete the project in case it wasn't removed during the previous run
  beforeAll(() => deleteProject('e2e-test-deploy-project'))
  // Clean up by deleting the project
  afterAll(() => deleteProject('e2e-test-deploy-project'))

  it('Simple project should deploy successfully', () => {
    const result = runChecklyCli({
      args: ['deploy', '--force'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures/deploy-project'),
    })
    expect(result.stderr).toBe('')
  })
})
