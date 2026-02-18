/* eslint-disable no-console */
import path from 'node:path'

import config from 'config'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { DateTime, Duration } from 'luxon'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'

import Projects from '../../src/rest/projects'
import { CheckTypes } from '../../src/constants'
import { FixtureSandbox, RunOptions } from '../../src/testing/fixture-sandbox'
import { ExecaError } from 'execa'

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
      'Authorization': `Bearer ${apiKey}`,
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
    const leftoverE2eProject = project.name.startsWith('e2e-test-deploy-project-')
      && DateTime.fromISO(project.created_at) < DateTime.now().minus(Duration.fromObject({ minutes: 20 }))
    if (leftoverE2eProject) {
      await projectsApi.deleteProject(project.logicalId)
    }
  }
}
async function getAllResources (type: 'checks' | 'check-groups' | 'private-locations') {
  const baseURL: string = config.get('baseURL')
  const accountId: string = config.get('accountId')
  const apiKey: string = config.get('apiKey')
  const entries: any[] = []
  const api = axios.create({
    baseURL,
    headers: {
      'x-checkly-account': accountId,
      'Authorization': `Bearer ${apiKey}`,
    },
  })
  // PL endpoint doesn't have pagination
  if (type === 'private-locations') {
    const { data } = await api({
      method: 'get',
      url: `/v1/${type}`,
    })
    return data
  }
  let pageNumber = 1
  while (true) {
    const { data } = await api({
      method: 'get',
      url: `/v1/${type}?&page=${pageNumber}&limit=100`,
    })
    if (data.length === 0) {
      break
    }
    entries.push(...data)
    pageNumber++
  }

  return entries
}

async function runDeploy (fixt: FixtureSandbox, args: string[], options?: RunOptions) {
  const result = await fixt.run('npx', [
    'checkly',
    'deploy',
    ...args,
  ], {
    timeout: 120_000,
    ...options,
  })

  if (result.exitCode !== 0) {
    console.error('stderr', result.stderr)
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  return result
}

describe('deploy', { timeout: 45_000 }, () => {
  // Create a unique ID suffix to support parallel test executions
  let projectLogicalId: string
  let privateLocationSlugname: string
  let latestVersion = ''
  // Cleanup projects that may have not been deleted in previous runs
  beforeAll(async () => {
    await cleanupProjects()
    const packageInformation = await axios.get('https://registry.npmjs.org/checkly/latest')
    latestVersion = packageInformation.data.version
  })
  beforeEach(() => {
    projectLogicalId = `e2e-test-deploy-project-${uuidv4()}`
    privateLocationSlugname = `private-location-cli-${uuidv4().split('-')[0]}`
  })
  // Clean up by deleting the project
  afterEach(() => cleanupProjects(projectLogicalId))
  afterAll(() => cleanupProjects())

  describe('deploy-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'deploy-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Simple project should deploy successfully (version v4.0.8)', async () => {
      const { stderr, stdout } = await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_CLI_VERSION: '4.0.8',
        },
      })

      expect(stderr).toBe('')
      // expect not to change version since the version is specified
      expect(stdout).not.toContain('Notice: replacing version')

      const checks = await getAllResources('checks')
      const checkGroups = await getAllResources('check-groups')
      const privateLocations = await getAllResources('private-locations')

      // Check that all assignments were applied
      // Filter out heartbeat checks as they don't have the privateLocations property
      expect(checks.filter(({ checkType }: { checkType: string }) => checkType !== CheckTypes.HEARTBEAT)
        .filter(({ privateLocations }: { privateLocations: string[] }) =>
          privateLocations.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(1)
      expect(checkGroups.filter(({ privateLocations }: { privateLocations: string[] }) =>
        privateLocations.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(2)
      expect(privateLocations
        .filter(({ slugName }: { slugName: string }) => slugName.startsWith(privateLocationSlugname)).length).toEqual(1)
    })

    it('Simple project should deploy successfully', async () => {
      const { stderr, stdout } = await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_CLI_VERSION: undefined,
        },
      })
      expect(stderr).toBe('')
      // expect the version to be overriden with latest from NPM
      expect(stdout).toContain(`Notice: replacing version '0.0.1-dev' with latest '${latestVersion}'`)

      const checks = await getAllResources('checks')
      const checkGroups = await getAllResources('check-groups')
      const privateLocations = await getAllResources('private-locations')

      // Check that all assignments were applied
      // Filter out heartbeat checks as they don't have the privateLocations property
      expect(checks.filter(({ checkType }: { checkType: string }) => checkType !== CheckTypes.HEARTBEAT)
        .filter(({ privateLocations }: { privateLocations: string[] }) =>
          privateLocations.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(1)
      expect(checkGroups.filter(({ privateLocations }: { privateLocations: string[] }) =>
        privateLocations.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(2)
      expect(privateLocations
        .filter(({ slugName }: { slugName: string }) => slugName.startsWith(privateLocationSlugname)).length).toEqual(1)
    })

    it('Should deploy with different config file', async () => {
      const resultOne = await runDeploy(fixt, ['--preview'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_CLI_VERSION: '4.8.0',
        },
        timeout: 10000,
      })
      const resultTwo = await runDeploy(fixt, ['--preview', '--config', 'checkly.staging.config.ts'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_CLI_VERSION: '4.8.0',
        },
        timeout: 10000,
      })
      expect(resultOne.stdout).toContain(
        `Create:
    ApiCheck: api-check
    ApiCheck: api-check-high-freq
    ApiCheck: api-check-incident-trigger
    ApiCheck: api-check-retry-only-on-network-error
    DnsMonitor: dns-nonexistent-all-assertion-types
    DnsMonitor: dns-welcome-a
    DnsMonitor: dns-welcome-aaaa
    HeartbeatMonitor: heartbeat-monitor-1
    BrowserCheck: homepage-browser-check
    TcpMonitor: tcp-monitor
    CheckGroupV2: my-group-1
    CheckGroupV1: my-group-2-v1
    Dashboard: dashboard-1
    MaintenanceWindow: maintenance-window-1
    PrivateLocation: private-location-1
    StatusPage: test-page-1
    StatusPageService: bar-service
    StatusPageService: foo-service
`)
      expect(resultTwo.stdout).toContain(
        `Create:
    ApiCheck: api-check
    ApiCheck: api-check-high-freq
    ApiCheck: api-check-incident-trigger
    ApiCheck: api-check-retry-only-on-network-error
    DnsMonitor: dns-nonexistent-all-assertion-types
    DnsMonitor: dns-welcome-a
    DnsMonitor: dns-welcome-aaaa
    HeartbeatMonitor: heartbeat-monitor-1
    BrowserCheck: homepage-browser-check
    BrowserCheck: snapshot-test.test.ts
    TcpMonitor: tcp-monitor
    CheckGroupV2: my-group-1
    CheckGroupV1: my-group-2-v1
    Dashboard: dashboard-1
    MaintenanceWindow: maintenance-window-1
    PrivateLocation: private-location-1
`)
    })
  })

  describe('deploy-esm-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'deploy-esm-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Simple esm project should deploy successfully', async () => {
      const { stderr } = await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_CLI_VERSION: '4.8.0',
        },
      })

      expect(stderr).toBe('')
    })
  })

  describe('test-only-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-only-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should mark testOnly check as skipped', async () => {
      const { stdout } = await runDeploy(fixt, ['--preview'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          TEST_ONLY: 'true',
          CHECKLY_CLI_VERSION: '4.8.0',
        },
      })
      expect(stdout).toContain(
        `Create:
    ApiCheck: not-testonly-default-check
    ApiCheck: not-testonly-false-check

Skip (testOnly):
    ApiCheck: testonly-true-check
`)
    })

    it('Should mark testOnly check as deleted if there is a deletion', async () => {
      // Deploy a check (testOnly=false)
      await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          TEST_ONLY: 'false',
          CHECKLY_CLI_VERSION: '4.8.0',
        },
      })
      // Deploy a check (testOnly=true)
      const { stdout } = await runDeploy(fixt, ['--force', '--output'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          TEST_ONLY: 'true',
          CHECKLY_CLI_VERSION: '4.8.0',
        },
      })
      // Moving the check to testOnly causes it to be deleted.
      // The check should only be listed under "Delete" and not "Skip".
      expect(stdout).toContain(
        `Delete:
    Check: testonly-true-check

Update and Unchanged:
    ApiCheck: not-testonly-default-check
    ApiCheck: not-testonly-false-check`)
    })
  })

  describe('empty-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'empty-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should terminate when no resources are found', async () => {
      expect.assertions(1)
      try {
        await runDeploy(fixt, [], {
          env: {
            PROJECT_LOGICAL_ID: projectLogicalId,
            PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
            CHECKLY_CLI_VERSION: '4.8.0',
          },
        })
      } catch (err: any) {
        if (err instanceof ExecaError) {
          expect(err.stderr).toContain('Failed to deploy your project. Unable to find constructs to deploy.')
        } else {
          throw err
        }
      }
    })
  })

  describe('snapshot-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'snapshot-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should deploy a project with snapshots', async () => {
      await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          CHECKLY_CLI_VERSION: '4.8.0',
        },
      })
      // TODO: Add assertions that the snapshots are successfully uploaded.
    })
  })
})
