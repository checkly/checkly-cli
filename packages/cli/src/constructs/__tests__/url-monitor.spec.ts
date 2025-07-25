import { describe, it, expect, beforeEach } from 'vitest'

import { UrlMonitor } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('UrlMonitor', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate URL format', async () => {
      const urlMonitor = new UrlMonitor('test-url', {
        name: 'Test URL',
        request: {
          url: 'ftp://example.com'
        }
      })

      const diagnostics = new Diagnostics()
      await urlMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('URL must start with http:// or https://')
          })
        ])
      )
    })

    it('should validate URL length', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2030)
      const urlMonitor = new UrlMonitor('test-url', {
        name: 'Test URL',
        request: {
          url: longUrl
        }
      })

      const diagnostics = new Diagnostics()
      await urlMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('URL length must not exceed 2048 characters')
          })
        ])
      )
    })

    it('should validate IP family', async () => {
      const urlMonitor = new UrlMonitor('test-url', {
        name: 'Test URL',
        request: {
          url: 'https://example.com',
          ipFamily: 'IPv5' as any
        }
      })

      const diagnostics = new Diagnostics()
      await urlMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid IP family')
          })
        ])
      )
    })

    it('should validate response times', async () => {
      const urlMonitor = new UrlMonitor('test-url', {
        name: 'Test URL',
        request: {
          url: 'https://example.com'
        },
        degradedResponseTime: -100,
        maxResponseTime: 40000
      })

      const diagnostics = new Diagnostics()
      await urlMonitor.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('must be 0 or greater')
          }),
          expect.objectContaining({
            message: expect.stringContaining('must be 30000 or lower')
          })
        ])
      )
    })

    it('should accept valid configuration', async () => {
      const urlMonitor = new UrlMonitor('test-url', {
        name: 'Test URL',
        request: {
          url: 'https://example.com/api/health',
          ipFamily: 'IPv4',
          followRedirects: true,
          skipSSL: false
        },
        degradedResponseTime: 1000,
        maxResponseTime: 5000
      })

      const diagnostics = new Diagnostics()
      await urlMonitor.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
