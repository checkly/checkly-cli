import { describe, it, expect, beforeEach } from 'vitest'

import { Project, Session } from '../project'
import { Construct } from '../construct'
import { Diagnostics } from '../diagnostics'

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

  it('should produce a diagnostic for non-string logicalId instead of throwing', async () => {
    const construct = new TestConstruct(123 as any)
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

  it('should produce a diagnostic for duplicate logicalId instead of throwing', async () => {
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
        message: expect.stringContaining('A check with logicalId "duplicate-id" already exists'),
      }),
    ]))
  })
})
