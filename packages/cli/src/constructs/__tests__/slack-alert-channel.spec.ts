import { describe, it, expect, beforeEach } from 'vitest'

import { SlackAlertChannel } from '../index'
import { Project, Session } from '../project'
import { Diagnostics } from '../diagnostics'

describe('SlackAlertChannel', () => {
  describe('validation', () => {
    beforeEach(() => {
      Session.project = new Project('validation-test-project', {
        name: 'Validation Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })
    })

    it('should validate Slack webhook URL domain', async () => {
      const slackChannel = new SlackAlertChannel('test-slack', {
        url: 'https://example.com/webhook'
      })

      const diagnostics = new Diagnostics()
      await slackChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('URL must be a valid Slack webhook URL')
          })
        ])
      )
    })

    it('should validate URL format', async () => {
      const slackChannel = new SlackAlertChannel('test-slack', {
        url: 'invalid-url'
      })

      const diagnostics = new Diagnostics()
      await slackChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid URL format')
          })
        ])
      )
    })

    it('should validate Slack channel format', async () => {
      const slackChannel = new SlackAlertChannel('test-slack', {
        url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
        channel: 'invalid-channel-format'
      })

      const diagnostics = new Diagnostics()
      await slackChannel.validate(diagnostics)

      expect(diagnostics.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Invalid Slack channel format')
          })
        ])
      )
    })

    it('should validate various invalid channel formats', async () => {
      const invalidChannels = [
        'no-prefix',
        '#',
        '@',
        '#channel with spaces',
        '@user with spaces',
        '##double-hash',
        '@@double-at'
      ]

      for (const [i, channel] of invalidChannels.entries()) {
        const slackChannel = new SlackAlertChannel(`test-slack-invalid-${i}`, {
          url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
          channel
        })

        const diagnostics = new Diagnostics()
        await slackChannel.validate(diagnostics)

        expect(diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Invalid Slack channel format')
            })
          ])
        )
      }
    })

    it('should accept valid Slack configuration', async () => {
      const slackChannel = new SlackAlertChannel('test-slack', {
        url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
        channel: '#alerts'
      })

      const diagnostics = new Diagnostics()
      await slackChannel.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })

    it('should accept valid Slack channel formats', async () => {
      const validChannels = [
        '#general',
        '@user',
        '#team-alerts',
        '@john_doe',
        '#channel_with_underscores',
        '#channel-with-hyphens'
      ]

      for (const channel of validChannels) {
        const slackChannel = new SlackAlertChannel(`test-slack-${channel.replace(/[^a-zA-Z0-9]/g, '-')}`, {
          url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
          channel
        })

        const diagnostics = new Diagnostics()
        await slackChannel.validate(diagnostics)

        expect(diagnostics.isFatal()).toBe(false)
      }
    })

    it('should accept URL object type', async () => {
      const slackChannel = new SlackAlertChannel('test-slack', {
        url: new URL('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX')
      })

      const diagnostics = new Diagnostics()
      await slackChannel.validate(diagnostics)

      expect(diagnostics.isFatal()).toBe(false)
    })
  })
})
