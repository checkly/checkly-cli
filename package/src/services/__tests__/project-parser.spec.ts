import * as path from 'path'
import { parseProject } from '../project-parser'

describe('parseProject()', () => {
  it('should parse a simple project', async () => {
    const simpleProjectPath = path.join(__dirname, 'project-parser-fixtures', 'simple-project')
    const project = await parseProject({
      directory: simpleProjectPath,
      projectLogicalId: 'project-id',
      projectName: 'project name',
      repoUrl: 'https://github.com/checkly/checkly-cli',
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
