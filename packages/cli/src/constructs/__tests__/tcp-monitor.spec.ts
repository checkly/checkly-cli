import { describe, it, expect, beforeEach } from 'vitest'

import { TcpMonitor, CheckGroup, TcpRequest } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

const request: TcpRequest = {
  hostname: 'acme.com',
  port: 443,
}

describe('TcpMonitor', () => {
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
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
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
    Session.checkDefaults = undefined
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

  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate port range', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'example.com',
          port: 70000
        }
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Port must be between 1 and 65535')
          })
        ])
      )
    })

    it('should validate hostname format - no scheme', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'https://example.com',
          port: 443
        }
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Hostname should not include a scheme')
          })
        ])
      )
    })

    it('should validate hostname format - no port', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'example.com:8080',
          port: 443
        }
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Hostname should not include a port number')
          })
        ])
      )
    })

    it('should validate IP family', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'example.com',
          port: 443,
          ipFamily: 'IPv5' as any
        }
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid IP family')
          })
        ])
      )
    })

    it('should validate response times', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'example.com',
          port: 443
        },
        degradedResponseTime: -100,
        maxResponseTime: 10000
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('must be 0 or greater')
          }),
          expect.objectContaining({
            message: expect.stringContaining('must be 5000 or lower')
          })
        ])
      )
    })

    it('should accept valid configuration', async () => {
      const tcpMonitor = new TcpMonitor('test-tcp', {
        name: 'Test TCP',
        request: {
          hostname: 'example.com',
          port: 443,
          ipFamily: 'IPv4'
        },
        degradedResponseTime: 1000,
        maxResponseTime: 3000
      })

      const diagnostics = new Diagnostics()
      await tcpMonitor.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
