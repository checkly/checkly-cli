import { describe, it, expect } from 'vitest'

import { DnsMonitor, CheckGroup, DnsRequest, Diagnostics } from '../index'
import { Project, Session } from '../project'

const request: DnsRequest = {
  recordType: 'A',
  query: 'acme.com',
}

describe('DnsMonitor', () => {
  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new DnsMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new DnsMonitor('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['test check'] })
  })

  it('should support setting groups with `groupId`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new DnsMonitor('main-check', {
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
    const check = new DnsMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  describe('validation', () => {
    it('should error if doubleCheck is set', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new DnsMonitor('test-check', {
        name: 'Test Check',
        request,
        // @ts-expect-error Not available in the type.
        doubleCheck: true,
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "doubleCheck" is not supported.'),
        }),
      ]))
    })

    it('should error if degradedResponseTime is above 5000', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check1 = new DnsMonitor('test-check-1', {
        name: 'Test Check',
        request,
        degradedResponseTime: 5000,
      })

      const diags1 = new Diagnostics()
      await check1.validate(diags1)

      expect(diags1.isFatal()).toEqual(false)

      const check2 = new DnsMonitor('test-check-2', {
        name: 'Test Check',
        request,
        degradedResponseTime: 5001,
      })

      const diags2 = new Diagnostics()
      await check2.validate(diags2)

      expect(diags2.isFatal()).toEqual(true)
      expect(diags2.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value of "degradedResponseTime" must be 5000 or lower.'),
        }),
      ]))
    })

    it('should error if maxResponseTime is above 5000', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check1 = new DnsMonitor('test-check-1', {
        name: 'Test Check',
        request,
        maxResponseTime: 5000,
      })

      const diags1 = new Diagnostics()
      await check1.validate(diags1)

      expect(diags1.isFatal()).toEqual(false)

      const check2 = new DnsMonitor('test-check-2', {
        name: 'Test Check',
        request,
        maxResponseTime: 5001,
      })

      const diags2 = new Diagnostics()
      await check2.validate(diags2)

      expect(diags2.isFatal()).toEqual(true)
      expect(diags2.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value of "maxResponseTime" must be 5000 or lower.'),
        }),
      ]))
    })

    it('should error if nameServer is set but port is not', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new DnsMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          nameServer: '1.1.1.1',
        },
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('A value for "port" is required when "nameServer" is set.'),
        }),
      ]))
    })

    it('should error if port is set but nameServer is not', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new DnsMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          port: 53,
        },
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('A value for "nameServer" is required when "port" is set.'),
        }),
      ]))
    })

    it('should not error if neither nameServer nor port are set', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new DnsMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
        },
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
    })

    it('should not error if both nameServer and port are set', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new DnsMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          port: 53,
          nameServer: '1.1.1.1',
        },
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(false)
    })
  })
})
