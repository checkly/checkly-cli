import { describe, it, expect } from 'vitest'

import { StatusPageService, Diagnostics } from '../index'
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

  it('should validate that fromId() receives a valid UUID', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const valid = StatusPageService.fromId('e79b4cf8-467e-4902-917d-82b155b42024')
    const validDiags = new Diagnostics()
    await valid.validate(validDiags)
    expect(validDiags.isFatal()).toEqual(false)

    const invalid = StatusPageService.fromId('not-a-uuid')
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
