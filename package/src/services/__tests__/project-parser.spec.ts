import * as path from 'path'
import { parseProject } from '../project-parser'

const runtimes = {
  '2022.10': { name: '2022.10', default: false, stage: 'CURRENT', description: 'Main updates are Playwright 1.28.0, Node.js 16.x and Typescript support. We are also dropping support for Puppeteer', dependencies: { '@playwright/test': '1.28.0', '@opentelemetry/api': '1.0.4', '@opentelemetry/sdk-trace-base': '1.0.1', '@faker-js/faker': '5.5.3', aws4: '1.11.0', axios: '0.27.2', btoa: '1.2.1', chai: '4.3.7', 'chai-string': '1.5.0', 'crypto-js': '4.1.1', expect: '29.3.1', 'form-data': '4.0.0', jsonwebtoken: '8.5.1', lodash: '4.17.21', mocha: '10.1.0', moment: '2.29.2', node: '16.x', otpauth: '9.0.2', playwright: '1.28.0', typescript: '4.8.4', uuid: '9.0.0' } },
}

describe('parseProject()', () => {
  it('should parse a simple project', async () => {
    const simpleProjectPath = path.join(__dirname, 'project-parser-fixtures', 'simple-project')
    const project = await parseProject({
      directory: simpleProjectPath,
      projectLogicalId: 'project-id',
      projectName: 'project name',
      repoUrl: 'https://github.com/checkly/checkly-cli',
      runtimeId: '2022.10',
      availableRuntimes: runtimes,
    })
    const synthesizedProject = project.synthesize()
    expect(synthesizedProject).toMatchObject({
      project: {
        logicalId: 'project-id',
        name: 'project name',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      },
      checks: {
        'check-1': {},
        'check-2': {},
      },
    })
    expect(Object.keys(synthesizedProject.checks)).toHaveLength(2)
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
      checks: {
        'ts-check': {},
      },
    })
  })
})
