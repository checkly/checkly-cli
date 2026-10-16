import { describe, it, expect } from 'vitest'

import { AlertChannel, AlertChannelProps, Diagnostics, EmailAlertChannel } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

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
  it('should produce a diagnostic if the same logicalId is used twice', async () => {
    const project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.project = project

    new TestAlertChannel('foo', {})
    new TestAlertChannel('foo', {})

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('already exists'),
      }),
    ]))
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

  describe('synthesize', () => {
    it('sends every flag with its default when the construct sets none', () => {
      Session.project = new Project('project-id', { name: 'Test Project' })
      const channel = new EmailAlertChannel('email', { address: 'ops@example.com' })
      expect(channel.synthesize()).toMatchObject({
        sendRecovery: true,
        sendFailure: true,
        sendDegraded: false,
        sslExpiry: false,
        sslExpiryThreshold: 30,
      })
    })

    it('sends the flags the construct sets', () => {
      Session.project = new Project('project-id', { name: 'Test Project' })
      const channel = new EmailAlertChannel('email', {
        address: 'ops@example.com',
        sendRecovery: false,
        sendDegraded: true,
        sslExpiry: true,
        sslExpiryThreshold: 7,
      })
      expect(channel.synthesize()).toMatchObject({
        sendRecovery: false,
        sendFailure: true,
        sendDegraded: true,
        sslExpiry: true,
        sslExpiryThreshold: 7,
      })
    })
  })
})
