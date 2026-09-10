import { describe, it, expect, beforeEach } from 'vitest'

import { StatusPageV3, StatusPageV3AutomationRule, StatusPageV3Component, Diagnostics } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const newProject = () => {
  const project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
  Session.project = project
  return project
}

describe('StatusPageV3', () => {
  beforeEach(() => {
    newProject()
  })

  it('shares the status-page type key and synthesizes the v3 discriminator', () => {
    const page = new StatusPageV3('acme', {
      name: 'ACME',
      url: 'acme-status',
      defaultTheme: 'DARK',
      termsOfServiceLink: 'https://acme.example/terms',
      allowIndexing: false,
      isPrivate: true,
    })

    expect(page.type).toBe('status-page')
    expect(page.synthesize()).toEqual(expect.objectContaining({
      name: 'ACME',
      url: 'acme-status',
      defaultTheme: 'DARK',
      termsOfServiceLink: 'https://acme.example/terms',
      allowIndexing: false,
      isPrivate: true,
      version: 3,
    }))
    expect(page.synthesize()).not.toHaveProperty('cards')
  })

  it('should produce a diagnostic if the same logicalId is used twice', async () => {
    const project = newProject()

    new StatusPageV3('foo', { name: 'foo', url: 'foo' })
    new StatusPageV3('foo', { name: 'foo', url: 'foo' })

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    ]))
  })

  it('should validate that fromId() receives a valid UUID', async () => {
    const valid = StatusPageV3.fromId('e79b4cf8-467e-4902-917d-82b155b42024')
    const validDiags = new Diagnostics()
    await valid.validate(validDiags)
    expect(validDiags.isFatal()).toEqual(false)
    expect(valid.synthesize()).toBeNull()

    const invalid = StatusPageV3.fromId('not-a-uuid')
    const invalidDiags = new Diagnostics()
    await invalid.validate(invalidDiags)
    expect(invalidDiags.isFatal()).toEqual(true)
  })
})

describe('StatusPageV3Component', () => {
  beforeEach(() => {
    newProject()
  })

  it('synthesizes refs to its page and parent', () => {
    const page = new StatusPageV3('acme', { name: 'ACME', url: 'acme-status' })
    const group = new StatusPageV3Component('web-app', { statusPage: page, type: 'GROUP', name: 'Web', displayOrder: 1 })
    const service = new StatusPageV3Component('login', {
      statusPage: page,
      parent: group,
      name: 'Login',
      hidden: true,
      displayOrder: 2,
    })

    expect(group.synthesize()).toEqual({
      statusPageId: { ref: 'acme' },
      parentId: null,
      type: 'GROUP',
      name: 'Web',
      description: undefined,
      hidden: undefined,
      displayOrder: 1,
    })
    expect(service.synthesize()).toEqual(expect.objectContaining({
      statusPageId: { ref: 'acme' },
      parentId: { ref: 'web-app' },
      type: 'SERVICE',
      hidden: true,
    }))
  })

  it('accepts a page referenced by id', () => {
    const page = StatusPageV3.fromId('e79b4cf8-467e-4902-917d-82b155b42024')
    const component = new StatusPageV3Component('login', { statusPage: page, name: 'Login', displayOrder: 1 })
    expect(component.synthesize().statusPageId).toEqual({ ref: page.logicalId })
  })

  it('rejects a parent that is not a GROUP', async () => {
    const page = new StatusPageV3('acme', { name: 'ACME', url: 'acme-status' })
    const sibling = new StatusPageV3Component('sibling', { statusPage: page, name: 'Sibling', displayOrder: 1 })
    const child = new StatusPageV3Component('child', { statusPage: page, parent: sibling, name: 'Child', displayOrder: 1 })

    const diagnostics = new Diagnostics()
    await child.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('GROUP') }),
    ]))
  })

  it('rejects a parent on another status page', async () => {
    const pageA = new StatusPageV3('a', { name: 'A', url: 'a' })
    const pageB = new StatusPageV3('b', { name: 'B', url: 'b' })
    const group = new StatusPageV3Component('group', { statusPage: pageA, type: 'GROUP', name: 'G', displayOrder: 1 })
    const child = new StatusPageV3Component('child', { statusPage: pageB, parent: group, name: 'C', displayOrder: 1 })

    const diagnostics = new Diagnostics()
    await child.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('same status page') }),
    ]))
  })
})

describe('StatusPageV3AutomationRule', () => {
  beforeEach(() => {
    newProject()
  })

  it('synthesizes the backend field names and component refs', () => {
    const page = new StatusPageV3('acme', { name: 'ACME', url: 'acme-status' })
    const email = new StatusPageV3Component('email', { statusPage: page, name: 'Email', displayOrder: 1 })
    const rule = new StatusPageV3AutomationRule('api-down', {
      statusPage: page,
      name: 'API down',
      firstUpdate: 'Investigating',
      lastUpdate: 'Resolved',
      tags: ['api:public'],
      coolDownMinutes: 10,
      components: [{ component: email, targetImpact: 'MAJOR_OUTAGE' }],
    })

    expect(rule.synthesize()).toEqual({
      statusPageId: { ref: 'acme' },
      name: 'API down',
      enabled: undefined,
      firstUpdate: 'Investigating',
      lastUpdate: 'Resolved',
      notifySubscribers: undefined,
      tags: ['api:public'],
      coolDownWindowMinutes: 10,
      components: [{ componentId: { ref: 'email' }, targetImpact: 'MAJOR_OUTAGE' }],
    })
  })

  it('rejects an empty tag list and components from another page', async () => {
    const pageA = new StatusPageV3('a', { name: 'A', url: 'a' })
    const pageB = new StatusPageV3('b', { name: 'B', url: 'b' })
    const foreign = new StatusPageV3Component('foreign', { statusPage: pageB, name: 'F', displayOrder: 1 })
    const rule = new StatusPageV3AutomationRule('rule', {
      statusPage: pageA,
      name: 'r',
      firstUpdate: 'a',
      lastUpdate: 'b',
      tags: [],
      components: [{ component: foreign, targetImpact: 'MAJOR_OUTAGE' }],
    })

    const diagnostics = new Diagnostics()
    await rule.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    const messages = diagnostics.observations.map(o => o.message)
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('at least one tag'),
      expect.stringContaining('another status page'),
    ]))
  })
})
