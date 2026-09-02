/* eslint-disable no-console */
import path from 'node:path'

import config from 'config'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { DateTime, Duration } from 'luxon'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'

import Projects from '../../src/rest/projects'
import { FixtureSandbox, RunOptions } from '../../src/testing/fixture-sandbox'
import { checklyEnv } from '../run-checkly'
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
  // The untargeted sweep reclaims projects leaked by runs that died between
  // beforeEach and afterEach (e.g. a CI timeout). It is an opportunistic safety
  // net running inside beforeAll/afterAll hooks, so it must never fail the
  // suite: warn and move on instead of letting errors propagate out of the
  // hook. Note this axios client has none of the rest/api interceptors, so API
  // errors stay raw AxiosErrors — deleteProject's ConflictError-based
  // wait-for-predecessor loop never engages here, and a concurrent shard's 409
  // fails fast instead of blocking the hook for up to 30 minutes.
  try {
    const { data: projects } = await projectsApi.getAll()
    // Each delete submits an async deletion and streams it to completion, so
    // draining a backlog can take a while. A hook timeout aborts from outside
    // this function where no catch can run — stop deleting well before it and
    // let later runs reclaim the rest.
    const deadline = Date.now() + 60_000
    let matched = 0
    let deleted = 0
    let leftUndone = 0
    for (const project of projects) {
      if (!project.logicalId.startsWith('e2e-test-deploy-project-')) {
        continue
      }
      matched++
      const createdAt = DateTime.fromISO(project.created_at)
      if (!createdAt.isValid) {
        // An invalid timestamp compares false silently, which would quietly
        // disable the sweep — the failure mode that kept it dead for years.
        // Make it loud instead.
        console.warn(`Leftover-project sweep: ${project.logicalId} has unparseable created_at`
          + ` ${JSON.stringify(project.created_at)}, skipping`)
        continue
      }
      // The 20-minute age guard keeps the sweep safe against concurrent jobs: a
      // live test project only exists for the duration of a single test, so
      // nothing another job is still using is ever 20 minutes old.
      if (createdAt >= DateTime.now().minus(Duration.fromObject({ minutes: 20 }))) {
        continue
      }
      if (Date.now() >= deadline) {
        leftUndone++
        continue
      }
      // deleteProject streams the async deletion to completion and this client
      // sets no request timeout, so a single slow delete could otherwise outlive
      // the hook timeout, which aborts from outside any catch. Bound it by the
      // remaining budget instead; a raced-out delete keeps running detached,
      // which is harmless — its rejection is handled inline below, and a late
      // server-side completion is the desired outcome anyway.
      let budgetTimer: NodeJS.Timeout | undefined
      const outcome = await Promise.race([
        projectsApi.deleteProject(project.logicalId).then(
          () => ({ ok: true as const }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        new Promise<'out-of-budget'>(resolve => {
          budgetTimer = setTimeout(resolve, deadline - Date.now(), 'out-of-budget')
        }),
      ])
      clearTimeout(budgetTimer)
      if (outcome === 'out-of-budget') {
        console.warn(`Leftover-project sweep: time budget ran out while deleting ${project.logicalId};`
          + ' the deletion continues server-side')
        continue
      }
      if (!outcome.ok) {
        console.warn(`Leftover-project sweep: failed to delete ${project.logicalId}:`, outcome.err)
        continue
      }
      deleted++
      console.log(`Leftover-project sweep: deleted ${project.logicalId} (created ${project.created_at})`)
    }
    if (leftUndone > 0) {
      console.warn(`Leftover-project sweep: time budget exhausted with ${leftUndone} candidate(s) left;`
        + ' a later run will reclaim them')
    }
    // Always log a summary: a sweep with nothing to reclaim must be
    // distinguishable from a sweep that is silently broken.
    console.log(`Leftover-project sweep: scanned ${projects.length}, matched ${matched}, deleted ${deleted}`)
  } catch (err) {
    console.warn('Leftover-project sweep failed:', err)
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
  const result = await fixt.run('pnpm', [
    'checkly',
    'deploy',
    ...args,
  ], {
    timeout: 120_000,
    ...options,
    env: {
      ...checklyEnv(),
      ...options?.env,
    },
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
  // Cleanup projects that may have not been deleted in previous runs
  beforeAll(async () => {
    await cleanupProjects()
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
        template: 'playwright',
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
          CHECKLY_E2E_CLI_VERSION: '4.0.8',
        },
      })

      expect(stderr).toBe('')
      // expect not to change version since the version is specified
      expect(stdout).not.toContain('Notice: replacing version')

      const checks = await getAllResources('checks')
      const checkGroups = await getAllResources('check-groups')
      const privateLocations = await getAllResources('private-locations')

      expect(checks.filter(({ privateLocations }: { privateLocations?: string[] }) =>
        privateLocations?.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(1)
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
          CHECKLY_E2E_CLI_VERSION: undefined,
        },
      })
      expect(stderr).toBe('')
      // Non-interactive runs should no longer emit the local-dev version notice.
      expect(stdout).not.toContain('Notice: replacing version')

      const checks = await getAllResources('checks')
      const checkGroups = await getAllResources('check-groups')
      const privateLocations = await getAllResources('private-locations')

      expect(checks.filter(({ privateLocations }: { privateLocations?: string[] }) =>
        privateLocations?.some(slugName => slugName.startsWith(privateLocationSlugname))).length).toEqual(1)
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
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
        },
        timeout: 10000,
      })
      const resultTwo = await runDeploy(fixt, ['--preview', '--config', 'checkly.staging.config.ts'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
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
    GrpcMonitor: grpc-monitor
    HeartbeatMonitor: heartbeat-monitor-1
    BrowserCheck: homepage-browser-check
    IcmpMonitor: icmp-welcome
    SslMonitor: ssl-monitor
    TcpMonitor: tcp-monitor
    TracerouteMonitor: traceroute-monitor
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
    GrpcMonitor: grpc-monitor
    HeartbeatMonitor: heartbeat-monitor-1
    BrowserCheck: homepage-browser-check
    IcmpMonitor: icmp-welcome
    BrowserCheck: snapshot-test.test.ts
    SslMonitor: ssl-monitor
    TcpMonitor: tcp-monitor
    TracerouteMonitor: traceroute-monitor
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
        template: 'playwright',
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
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
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
        template: 'playwright',
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
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
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
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
        },
      })
      // Deploy a check (testOnly=true)
      const { stdout } = await runDeploy(fixt, ['--force', '--output'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          TEST_ONLY: 'true',
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
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
      // --output without --verbose should not show name or id
      expect(stdout).not.toContain('name:')
      expect(stdout).not.toContain('id:')
    })

    it('Should show resource name and id with --verbose', async () => {
      const { stdout } = await runDeploy(fixt, ['--force', '--verbose'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
          TEST_ONLY: 'true',
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
        },
      })
      const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      // Each test uses a fresh projectLogicalId (see beforeEach), so the
      // first deploy in this test renders as Create, not Update.
      expect(stdout).toMatch(new RegExp(
        `Create:\n`
        + `    ApiCheck: not-testonly-default-check\n`
        + `      name: TestOnly=false \\(default\\) Check\n`
        + `      id: ${uuid}\n`
        + `    ApiCheck: not-testonly-false-check\n`
        + `      name: TestOnly=false Check\n`
        + `      id: ${uuid}`,
      ))
    })
  })

  describe('empty-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'empty-project'),
        template: 'playwright',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should terminate when no resources are found', async () => {
      expect.assertions(1)
      try {
        await runDeploy(fixt, ['--force'], {
          env: {
            PROJECT_LOGICAL_ID: projectLogicalId,
            PRIVATE_LOCATION_SLUG_NAME: privateLocationSlugname,
            CHECKLY_E2E_CLI_VERSION: '4.8.0',
          },
        })
      } catch (err: any) {
        if (err instanceof ExecaError) {
          expect(`${err.stdout}\n${err.stderr}`).toContain('Failed to deploy your project. Unable to find constructs to deploy.')
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
        template: 'playwright',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('Should deploy a project with snapshots', async () => {
      await runDeploy(fixt, ['--force'], {
        env: {
          PROJECT_LOGICAL_ID: projectLogicalId,
          CHECKLY_E2E_CLI_VERSION: '4.8.0',
        },
      })
      // TODO: Add assertions that the snapshots are successfully uploaded.
    })
  })
})
