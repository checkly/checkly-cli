import { describe, it, expect } from 'vitest'

import { StatusPageService } from '../index'
import { Project, Session } from '../project'

describe('StatusPageService', () => {
  it('should throw if the same logicalId is used twice', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const add = () => {
      new StatusPageService('foo', {
        name: 'foo',
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
      StatusPageService.fromId('e79b4cf8-467e-4902-917d-82b155b42024')
    }

    expect(add).not.toThrow()
    expect(add).not.toThrow()
  })
})
