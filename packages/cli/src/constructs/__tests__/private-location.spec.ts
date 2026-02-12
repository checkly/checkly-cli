import { describe, it, expect } from 'vitest'

import { PrivateLocation, Diagnostics } from '../index'
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
        slugName: 'test',
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

  it('should validate that fromId() receives a valid UUID', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const valid = PrivateLocation.fromId('46f93e43-bdb4-420b-af02-d5d54d390230')
    const validDiags = new Diagnostics()
    await valid.validate(validDiags)
    expect(validDiags.isFatal()).toEqual(false)

    const invalid = PrivateLocation.fromId('not-a-uuid')
    const invalidDiags = new Diagnostics()
    await invalid.validate(invalidDiags)
    expect(invalidDiags.isFatal()).toEqual(true)
    expect(invalidDiags.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('Value must be a valid UUID.'),
      }),
    ]))
  })
})
