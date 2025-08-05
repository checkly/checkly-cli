import { describe, it, expect, beforeEach } from 'vitest'

import { WebhookAlertChannel } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('WebhookAlertChannel', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate HTTP method', async () => {
      const webhookChannel = new WebhookAlertChannel('test-webhook', {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        method: 'INVALID' as any
      })

      const diagnostics = new Diagnostics()
      await webhookChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid HTTP method')
          })
        ])
      )
    })

    it('should validate URL format', async () => {
      const webhookChannel = new WebhookAlertChannel('test-webhook', {
        name: 'Test Webhook',
        url: 'not a url'
      })

      const diagnostics = new Diagnostics()
      await webhookChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid URL')
          })
        ])
      )
    })

    it('should validate various invalid URLs', async () => {
      const invalidUrls = [
        'just-text',
        'ftp://invalid-protocol.com',
        'http://',
        'https://',
        '://missing-protocol.com'
      ]

      for (const [i, url] of invalidUrls.entries()) {
        const webhookChannel = new WebhookAlertChannel(`test-webhook-invalid-${i}`, {
          name: 'Test Webhook',
          url
        })

        const diagnostics = new Diagnostics()
        await webhookChannel.validate(diagnostics)

        expect(diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Invalid URL')
            })
          ])
        )
      }
    })

    it('should accept valid webhook configuration', async () => {
      const webhookChannel = new WebhookAlertChannel('test-webhook', {
        name: 'Test Webhook',
        url: 'https://api.example.com/webhooks/alerts',
        method: 'POST',
        headers: [{ key: 'Authorization', value: 'Bearer token' }],
        queryParameters: [{ key: 'source', value: 'checkly' }]
      })

      const diagnostics = new Diagnostics()
      await webhookChannel.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })

    it('should accept URL object type', async () => {
      const webhookChannel = new WebhookAlertChannel('test-webhook', {
        name: 'Test Webhook',
        url: new URL('https://api.example.com/webhooks/alerts'),
        method: 'PUT'
      })

      const diagnostics = new Diagnostics()
      await webhookChannel.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
