import { describe, it, expect, afterAll, beforeEach } from 'vitest'

import { TcpMonitor, CheckGroup, TcpRequest } from '../index'
import { Project, Session } from '../project'

const request: TcpRequest = {
  hostname: 'acme.com',
  port: 443,
}

describe('TcpMonitor', () => {
  function clearDefaults () {
    Session.checkDefaults = undefined
    Session.monitorDefaults = undefined
  }

  beforeEach(clearDefaults)
  afterAll(clearDefaults)

  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new TcpMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should apply default monitor settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.monitorDefaults = { tags: ['default tags'] }
    const check = new TcpMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should prefer monitor settings over check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['check default tags'] }
    Session.monitorDefaults = { tags: ['monitor default tags'] }
    const check = new TcpMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    expect(check).toMatchObject({ tags: ['monitor default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new TcpMonitor('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      request,
    })
    expect(check).toMatchObject({ tags: ['test check'] })
  })

  it('should support setting groups with `groupId`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new TcpMonitor('main-check', {
      name: 'Main Check',
      request,
      groupId: group.ref(),
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should support setting groups with `group`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new TcpMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })
})
