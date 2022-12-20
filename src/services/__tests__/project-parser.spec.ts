import * as path from 'path'
import { parseProject } from '../project-parser'

describe('parseProject()', () => {
  const cwdMock = jest.spyOn(process, 'cwd')
  it('should parse a simple project', async () => {
    cwdMock.mockReturnValue(path.join(__dirname, 'project-parser-fixtures', 'simple-project'))
    const project = await parseProject()
    expect(project.synthesize()).toMatchObject({
      project: {
        logicalId: 'my-project',
        name: 'My Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      },
      checks: {
        'check-1': {},
        'check-2': {},
      },
    })
  })

  it('should parse a project with TypeScript configuration files', async () => {
    cwdMock.mockReturnValue(path.join(__dirname, 'project-parser-fixtures', 'typescript-project'))
    const project = await parseProject()
    expect(project.synthesize()).toMatchObject({
      project: {
        logicalId: 'ts-project',
      },
      checks: {
        'ts-check': {},
      },
    })
  })
})
