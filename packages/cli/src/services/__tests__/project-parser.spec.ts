import * as path from 'path'
import { AxiosResponse } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { privateLocations } from '../../rest/api'
import { parseProject } from '../project-parser'

const runtimes = {
  2023.02: { name: '2023.02', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
  2023.09: { name: '2023.09', default: true, stage: 'CURRENT', description: 'Main updates are Playwright 1.38.1 and the addition of ethers 6.7.1, prisma 5.1.1, zod 3.22.2, @t3-oss/env-nextjs 0.6.1 and @xmldom/xmldom 0.8.10. Node version is 18.', dependencies: { '@faker-js/faker': '8.0.2', '@google-cloud/local-auth': '3.0.0', '@opentelemetry/api': '1.4.1', '@opentelemetry/sdk-trace-base': '1.15.2', '@playwright/test': '1.38.1', '@t3-oss/env-nextjs': '0.6.1', '@xmldom/xmldom': '0.8.10', aws4: '1.12.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', 'date-fns': '2.30.0', 'date-fns-tz': '2.0.0', dotenv: '16.3.1', ethers: '6.7.1', expect: '29.6.2', 'form-data': '4.0.0', 'gmail-api-parse-message-ts': '2.2.32', 'google-auth-library': '9.0.0', googleapis: '126.0.0', jose: '4.14.4', jsdom: '22.1.0', jsonwebtoken: '9.0.1', lodash: '4.17.21', moment: '2.29.4', otpauth: '9.1.4', playwright: '1.38.1', prisma: '5.1.1', twilio: '4.15.0', uuid: '9.0.0', ws: '8.13.0', 'xml-crypto': '4.1.0', 'xml-encryption': '3.0.2', zod: '3.22.2' }, multiStepSupport: true },
}

const privateLocationId = uuidv4()
const mockPrivateLocationsResponse = {
  data: [{
    id: privateLocationId,
    slugName: 'my-external-private-location',
  }],
  status: 200,
  statusText: 'ok',
} as AxiosResponse

describe('parseProject()', () => {
  beforeAll(() => {
    jest.resetAllMocks()
    jest.spyOn(privateLocations, 'getAll').mockResolvedValue(mockPrivateLocationsResponse)
  })
  it('should parse a simple project', async () => {
    const simpleProjectPath = path.join(__dirname, 'project-parser-fixtures', 'simple-project')
    const project = await parseProject({
      directory: simpleProjectPath,
      projectLogicalId: 'project-id',
      projectName: 'project name',
      repoUrl: 'https://github.com/checkly/checkly-cli',
      availableRuntimes: runtimes,
    })
    const synthesizedProject = project.synthesize()
    expect(synthesizedProject).toMatchObject({
      project: {
        logicalId: 'project-id',
        name: 'project name',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      },
      resources: [
        {
          type: 'check',
          logicalId: 'browser-check-1',
        },
        {
          type: 'check',
          logicalId: 'browser-check-2',
        },
        {
          type: 'check',
          logicalId: 'api-check-1',
        },
      ],
    })
    expect(Object.keys(synthesizedProject.resources)).toHaveLength(3)
  })

  it('should parse a simple project with private-locations', async () => {
    const simpleProjectPath = path.join(__dirname, 'project-parser-fixtures', 'simple-project-with-pl')
    const project = await parseProject({
      directory: simpleProjectPath,
      projectLogicalId: 'project-id',
      projectName: 'project name',
      repoUrl: 'https://github.com/checkly/checkly-cli',
      availableRuntimes: runtimes,
    })
    const synthesizedProject = project.synthesize()
    expect(synthesizedProject).toMatchObject({
      project: {
        logicalId: 'project-id',
        name: 'project name',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      },
      resources: [
        {
          type: 'check',
          logicalId: 'browser-check-1',
        },
        {
          type: 'check-group',
          logicalId: 'group-1',
        },
        {
          type: 'private-location',
          logicalId: 'private-location-1',
          member: true,
        },
        {
          type: 'private-location',
          logicalId: `private-location-${privateLocationId}`,
          member: false,
        },
        {
          type: 'private-location-check-assignment',
          logicalId: 'private-location-check-assignment#browser-check-1#private-location-1',
        },
        {
          type: 'private-location-check-assignment',
          logicalId: `private-location-check-assignment#browser-check-1#private-location-${privateLocationId}`,
        },
        {
          type: 'private-location-group-assignment',
          logicalId: 'private-location-group-assignment#group-1#private-location-1',
        },
        {
          type: 'private-location-group-assignment',
          logicalId: `private-location-group-assignment#group-1#private-location-${privateLocationId}`,
        },
      ],
    })
    expect(Object.keys(synthesizedProject.resources)).toHaveLength(8)
  })

  it('should parse a project with TypeScript check files', async () => {
    const tsProjectPath = path.join(__dirname, 'project-parser-fixtures', 'typescript-project')
    const project = await parseProject({
      directory: tsProjectPath,
      projectLogicalId: 'ts-project-id',
      projectName: 'ts project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
      availableRuntimes: runtimes,
    })
    expect(project.synthesize()).toMatchObject({
      project: {
        logicalId: 'ts-project-id',
      },
      resources: [
        { type: 'check', logicalId: 'ts-check' },
      ],
    })
  })

  it('should parse a project with multiple glob patterns and deduplicate overlapping patterns', async () => {
    const globProjectPath = path.join(__dirname, 'project-parser-fixtures', 'multiple-glob-patterns-project')
    const project = await parseProject({
      directory: globProjectPath,
      projectLogicalId: 'glob-project-id',
      projectName: 'glob project',
      availableRuntimes: runtimes,
      checkMatch: ['**/__checks1__/*.check.js', '**/__checks2__/*.check.js', '**/__nested-checks__/*.check.js'],
      browserCheckMatch: ['**/__checks1__/*.spec.js', '**/__checks2__/*.spec.js', '**/__nested-checks__/*.spec.js'],
    })
    expect(project.synthesize()).toMatchObject({
      project: {
        logicalId: 'glob-project-id',
      },
      resources: [
        { type: 'check', logicalId: 'nested' },
        { type: 'check', logicalId: 'check1' },
        { type: 'check', logicalId: 'check2' },
        { type: 'check', logicalId: '__checks1__/__nested-checks__/nested.spec.js' },
        { type: 'check', logicalId: '__checks1__/check1.spec.js' },
        { type: 'check', logicalId: '__checks2__/check2.spec.js' },
      ],
    })
  })

  it('should throw error for empty browser-check script', async () => {
    try {
      const projectPath = path.join(__dirname, 'project-parser-fixtures', 'empty-script-project')
      await parseProject({
        directory: projectPath,
        projectLogicalId: 'empty-script-project-id',
        projectName: 'empty script project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
        availableRuntimes: runtimes,
        checkMatch: '**/*.foobar.js', // don't match .check.js files used for a different test
        browserCheckMatch: '**/*.spec.js',
      })
      // shouldn't reach this point
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e.message).toBe('Browser check "src/empty-script.spec.js" is not allowed to be empty')
    }
  })

  it('should throw error for empty environment variable', async () => {
    try {
      const projectPath = path.join(__dirname, 'project-parser-fixtures', 'empty-script-project')
      await parseProject({
        directory: projectPath,
        projectLogicalId: 'empty-script-project-id',
        projectName: 'empty script project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
        availableRuntimes: runtimes,
        browserCheckMatch: '**/*.foobar.js', // don't match .spec.js files used for a different test
      })
      // shouldn't reach this point
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e.message).toContain('Environment variable "EMPTY_FOO" from check group "check-group-1" is not allowed to be empty')
    }
  })

  it('should parse a project with multistep & browser glob patterns', async () => {
    const globProjectPath = path.join(__dirname, 'project-parser-fixtures', 'multistep-browser-glob-patterns')
    const project = await parseProject({
      directory: globProjectPath,
      projectLogicalId: 'glob-project-id',
      projectName: 'glob project',
      availableRuntimes: runtimes,
      checkMatch: [],
      browserCheckMatch: ['**/__checks__/browser/*.spec.js'],
      multiStepCheckMatch: ['**/__checks__/multistep/*.spec.js'],
      checkDefaults: {
        runtimeId: '2023.09',
      },
    })
    expect(project.synthesize()).toMatchObject({
      project: {
        logicalId: 'glob-project-id',
      },
      resources: [
        { type: 'check', logicalId: '__checks__/browser/check2.spec.js' },
        { type: 'check', logicalId: '__checks__/multistep/check1.spec.js' },
      ],
    })
  })
})
