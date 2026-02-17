import { describe, it, expect } from 'vitest'

import { AlertChannel, AlertChannelProps, Diagnostics } from '../index'
import { Project, Session } from '../project'

class TestAlertChannel extends AlertChannel {
  constructor (logicalId: string, props: AlertChannelProps) {
    super(logicalId, props)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `TestAlertChannel:${this.logicalId}`
  }

  synthesize () {
  }
}

describe('AlertChannel', () => {
  it('should throw if the same logicalId is used twice', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const add = () => {
      new TestAlertChannel('foo', {
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
      TestAlertChannel.fromId(123)
    }

    expect(add).not.toThrow()
    expect(add).not.toThrow()
  })

  it('should validate that fromId() receives a number', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })

    const valid = TestAlertChannel.fromId(123)
    const validDiags = new Diagnostics()
    await valid.validate(validDiags)
    expect(validDiags.isFatal()).toEqual(false)

    const invalid = TestAlertChannel.fromId('not-a-number' as any)
    const invalidDiags = new Diagnostics()
    await invalid.validate(invalidDiags)
    expect(invalidDiags.isFatal()).toEqual(true)
    expect(invalidDiags.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('Value must be a number.'),
      }),
    ]))
  })
})
