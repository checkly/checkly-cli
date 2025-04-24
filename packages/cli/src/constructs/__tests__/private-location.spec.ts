import { PrivateLocation } from '../index'
import { Project, Session } from '../project'

describe('PrivateLocation', () => {
  it('should throw if the same logicalId is used twice', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const add = () => {
      new PrivateLocation('foo', {
        name: 'Test',
        slugName: 'test'
      })
    }

    expect(add).not.toThrow()
    expect(add).toThrow('already exists')
  })

  it('should not throw if the same fromId() is used twice', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const add = () => {
      PrivateLocation.fromId('46f93e43-bdb4-420b-af02-d5d54d390230')
    }

    expect(add).not.toThrow()
    expect(add).not.toThrow()
  })
})
