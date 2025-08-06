import { describe, it, expect } from 'vitest'

import { AlertChannel, AlertChannelProps } from '../index'
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
})
