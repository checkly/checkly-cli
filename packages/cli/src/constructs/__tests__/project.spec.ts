import { describe, it, expect, beforeEach } from 'vitest'

import { Project } from '../project.js'
import { Session } from '../session.js'
import { Construct } from '../construct.js'
import { Diagnostics } from '../diagnostics.js'
import { ApiCheck } from '../api-check.js'
import { EmailAlertChannel } from '../email-alert-channel.js'
import { AlertChannelSubscription } from '../alert-channel-subscription.js'
import { PrivateLocationCheckAssignment } from '../private-location-check-assignment.js'
import { PrivateLocationGroupAssignment } from '../private-location-group-assignment.js'
import { Ref } from '../ref.js'

class TestConstruct extends Construct {
  constructor (logicalId: any) {
    super('test', logicalId)
  }

  describe (): string {
    return `Test:${this.logicalId}`
  }

  synthesize () {
    return null
  }
}

describe('Construct logicalId validation', () => {
  beforeEach(() => {
    Session.reset()
    Session.project = { addResource: () => {} } as any
  })

  it('should pass validation for valid logicalIds', async () => {
    const validIds = ['my-check', 'my_check', 'myCheck123', 'my/check', 'my#check', 'my.check']
    for (const id of validIds) {
      const construct = new TestConstruct(id)
      const diagnostics = new Diagnostics()
      await construct.validate(diagnostics)
      expect(diagnostics.isFatal(), `Expected "${id}" to be valid`).toBe(false)
    }
  })

  it('should store the original logicalId without modification', () => {
    const construct = new TestConstruct('my check')
    expect(construct.logicalId).toBe('my check')
  })

  it('should produce an error diagnostic for logicalIds with spaces', async () => {
    const construct = new TestConstruct('my check')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('contains invalid characters'),
      }),
    ]))
  })

  it('should produce an error diagnostic for logicalIds with special characters', async () => {
    const construct = new TestConstruct('my@check!')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('contains invalid characters'),
      }),
    ]))
  })

  it('should produce an error diagnostic for empty logicalIds', async () => {
    const construct = new TestConstruct('')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('contains invalid characters'),
      }),
    ]))
  })

  it('should produce a diagnostic for a non-string logicalId instead of throwing', async () => {
    const construct = new TestConstruct(123)
    expect(construct.logicalId).toBe('123')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('Expected a string but received type "number"'),
      }),
    ]))
  })

  it('accepts a logicalId of 255 characters and rejects one of 256', async () => {
    const valid = new Diagnostics()
    await new TestConstruct('a'.repeat(255)).validate(valid)
    expect(valid.isFatal()).toBe(false)

    const tooLong = new Diagnostics()
    await new TestConstruct('a'.repeat(256)).validate(tooLong)
    expect(tooLong.isFatal()).toBe(true)
    expect(tooLong.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('is 256 characters long. The maximum is 255.'),
      }),
    ]))
  })

  it('accepts a relation logicalId of 550 characters and rejects one of 551', async () => {
    const relations = [
      (logicalId: string) => new AlertChannelSubscription(logicalId, {
        alertChannelId: Ref.from('channel'), checkId: Ref.from('check'), activated: true,
      }),
      (logicalId: string) => new PrivateLocationCheckAssignment(logicalId, {
        privateLocationId: Ref.from('location'), checkId: Ref.from('check'),
      }),
      (logicalId: string) => new PrivateLocationGroupAssignment(logicalId, {
        privateLocationId: Ref.from('location'), groupId: Ref.from('group'),
      }),
    ]
    for (const relation of relations) {
      const valid = new Diagnostics()
      await relation('a'.repeat(550)).validate(valid)
      expect(valid.isFatal()).toBe(false)

      const tooLong = new Diagnostics()
      await relation('a'.repeat(551)).validate(tooLong)
      expect(tooLong.isFatal()).toBe(true)
      expect(tooLong.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('is 551 characters long. The maximum is 550.'),
        }),
      ]))
    }
  })

  it('accepts the subscription it composes from a check and an alert channel of the longest logicalIds', async () => {
    Session.reset()
    const project = new Project('test-project', { name: 'Test' })
    Session.project = project

    const alertChannel = new EmailAlertChannel('c'.repeat(255), { address: 'ops@example.com' })
    new ApiCheck('a'.repeat(255), {
      name: 'API',
      request: { method: 'GET', url: 'https://example.com' },
      alertChannels: [alertChannel],
    })
    const subscriptions = Object.keys(project.data['alert-channel-subscription'])
    expect(subscriptions.map(logicalId => logicalId.length)).toEqual([32 + 2 + 255 + 255])

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    expect(diagnostics.observations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('characters long') }),
    ]))
  })

  it('should produce a diagnostic for a duplicate logicalId instead of throwing', async () => {
    Session.reset()
    const project = new Project('test-project', { name: 'Test' })
    Session.project = project

    project.addResource('check', 'duplicate-id', new TestConstruct('duplicate-id'))
    project.addResource('check', 'duplicate-id', new TestConstruct('duplicate-id'))

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: expect.stringContaining('[Test:duplicate-id]'),
        message: expect.stringContaining('A check with logicalId "duplicate-id" already exists'),
      }),
    ]))
  })
})
