import { describe, it, expect, afterEach, beforeEach } from 'vitest'

import {
  AlertChannel,
  EmailAlertChannel,
  IncidentioAlertChannel,
  MSTeamsAlertChannel,
  OpsgenieAlertChannel,
  PagerdutyAlertChannel,
  PhoneCallAlertChannel,
  SlackAlertChannel,
  SlackAppAlertChannel,
  SmsAlertChannel,
  TelegramAlertChannel,
  WebhookAlertChannel,
} from '../index.js'
import { ConstructDiagnostic, IntegrationNotEntitledDiagnostic } from '../construct-diagnostics.js'
import { Diagnostics } from '../diagnostics.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import type { Account, AccountIntegration } from '../../rest/accounts.js'

const withIntegrations = (integrations?: AccountIntegration[]): Account => ({
  id: 'acc-1',
  name: 'Test Account',
  runtimeId: '2025.04',
  integrations,
})

const validate = async (channel: { validate (diagnostics: Diagnostics): Promise<void> }) => {
  const diagnostics = new Diagnostics()
  await channel.validate(diagnostics)
  return diagnostics
}

const webhook = (logicalId: string, webhookType?: string) => new WebhookAlertChannel(logicalId, {
  name: logicalId,
  url: 'https://example.com/hook',
  webhookType,
})

// Each construct with the integration type it uses and the name the
// diagnostic gives that integration.
const channels: Array<[string, () => AlertChannel, string, string]> = [
  ['SlackAlertChannel', () => new SlackAlertChannel('slack-1', { url: 'https://hooks.slack.com/x' }), 'SLACK', 'Slack'],
  ['SlackAppAlertChannel', () => new SlackAppAlertChannel('slack-app-1', { slackChannels: ['#ops'] }), 'SLACK', 'Slack'],
  ['PagerdutyAlertChannel', () => new PagerdutyAlertChannel('pagerduty-1', { serviceKey: 'key' }), 'PAGERDUTY', 'PagerDuty'],
  ['OpsgenieAlertChannel', () => new OpsgenieAlertChannel('opsgenie-1', {
    name: 'ops', apiKey: 'key', region: 'EU', priority: 'P1',
  }), 'OPSGENIE', 'Opsgenie'],
  ['SmsAlertChannel', () => new SmsAlertChannel('sms-1', { phoneNumber: '+15550100' }), 'SMS', 'SMS'],
  ['PhoneCallAlertChannel', () => new PhoneCallAlertChannel('call-1', { phoneNumber: '+15550100' }), 'PHONE_CALL', 'phone calls'],
  ['MSTeamsAlertChannel', () => new MSTeamsAlertChannel('teams-1', {
    name: 'teams', url: 'https://example.com/teams',
  }), 'MSTEAMS', 'Microsoft Teams'],
  ['TelegramAlertChannel', () => new TelegramAlertChannel('telegram-1', {
    name: 'telegram', chatId: '1', apiKey: 'key',
  }), 'TELEGRAM', 'Telegram'],
  ['IncidentioAlertChannel', () => new IncidentioAlertChannel('incidentio-1', {
    name: 'incidentio', url: 'https://example.com/incidentio', apiKey: 'key',
  }), 'INCIDENTIO', 'incident.io'],
]

const webhookTypes: Array<[string, string, string]> = [
  ['WEBHOOK_MSTEAMS', 'MSTEAMS', 'Microsoft Teams'],
  ['WEBHOOK_DISCORD', 'DISCORD', 'Discord'],
  ['WEBHOOK_TELEGRAM', 'TELEGRAM', 'Telegram'],
  ['WEBHOOK_FIREHYDRANT', 'FIREHYDRANT', 'FireHydrant'],
  ['WEBHOOK_GITLAB_ALERT', 'GITLAB', 'GitLab'],
  ['WEBHOOK_SPIKESH', 'SPIKE', 'Spike.sh'],
  ['WEBHOOK_SPLUNK', 'SPLUNK', 'Splunk'],
  ['WEBHOOK_CORALOGIX', 'CORALOGIX', 'Coralogix'],
  ['WEBHOOK_ILERT', 'ILERT', 'ilert'],
  ['WEBHOOK_INCIDENTIO', 'INCIDENTIO', 'incident.io'],
  ['WEBHOOK_ROOTLY', 'ROOTLY', 'Rootly'],
]

// Every integration type the constructs use, none of which the plan includes.
const noneEntitled = (): AccountIntegration[] => [
  ...new Set([...channels.map(([, , type]) => type), ...webhookTypes.map(([, type]) => type)]),
].map(type => ({ type, connected: true, entitled: false }))

describe('alert channel integration entitlement', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  afterEach(() => {
    Session.account = undefined
  })

  describe.each(channels)('%s', (construct, create, type, name) => {
    it('refuses the channel when the plan does not include its integration', async () => {
      Session.account = withIntegrations([{ type, connected: true, entitled: false }])
      const channel = create()

      const diagnostics = await validate(channel)

      expect(diagnostics.isFatal()).toBe(true)
      expect(diagnostics.observations).toEqual([
        expect.objectContaining({
          title: 'Integration not included in your plan',
          message: expect.stringContaining(
            `Alert channel '${channel.logicalId}' uses ${name}, which your plan doesn't include,`
            + ` so its alerts would never be sent.`,
          ),
        }),
      ])
      expect(diagnostics.observations[0]).toBeInstanceOf(IntegrationNotEntitledDiagnostic)
      expect(diagnostics.observations[0].message).toContain(
        'Hint: Upgrade your plan at https://app.checklyhq.com/accounts/acc-1/billing, or remove the channel.',
      )
    })

    it('accepts the channel when the plan includes its integration', async () => {
      Session.account = withIntegrations([{ type, connected: true, entitled: true }])

      const diagnostics = await validate(create())

      expect(diagnostics.isFatal()).toBe(false)
    })
  })

  describe('skips the check', () => {
    const pagerduty = () => new PagerdutyAlertChannel('pagerduty-1', { serviceKey: 'key' })

    it('when the API does not report whether the plan includes the integration', async () => {
      Session.account = withIntegrations([{ type: 'PAGERDUTY', connected: true }])

      expect((await validate(pagerduty())).isFatal()).toBe(false)
    })

    it('when the API does not report the integration', async () => {
      Session.account = withIntegrations([{ type: 'OTHER', connected: true, entitled: false }])

      expect((await validate(pagerduty())).isFatal()).toBe(false)
    })

    it('when the API does not report integrations', async () => {
      Session.account = withIntegrations(undefined)

      expect((await validate(pagerduty())).isFatal()).toBe(false)
    })

    it('without an authenticated account', async () => {
      expect((await validate(pagerduty())).isFatal()).toBe(false)
    })
  })

  describe.each(webhookTypes)('WebhookAlertChannel with webhookType %s', (webhookType, type, name) => {
    it(`refuses the channel when the plan does not include ${type}`, async () => {
      Session.account = withIntegrations([{ type, connected: true, entitled: false }])

      const diagnostics = await validate(webhook('hook-1', webhookType))

      expect(diagnostics.observations).toEqual([
        expect.objectContaining({
          title: 'Integration not included in your plan',
          message: expect.stringContaining(`Alert channel 'hook-1' uses ${name}, which your plan doesn't include`),
        }),
      ])
      expect(diagnostics.observations[0]).toBeInstanceOf(IntegrationNotEntitledDiagnostic)
    })

    it(`accepts the channel when the plan includes ${type}`, async () => {
      Session.account = withIntegrations([{ type, connected: true, entitled: true }])

      const diagnostics = await validate(webhook('hook-1', webhookType))

      expect(diagnostics.isFatal()).toBe(false)
    })
  })

  it('accepts a plain webhook, which uses no reported integration', async () => {
    Session.account = withIntegrations(noneEntitled())

    expect((await validate(webhook('hook-1'))).isFatal()).toBe(false)
    expect((await validate(webhook('hook-2', 'WEBHOOK_SOMETHING_NEW'))).isFatal()).toBe(false)
  })

  it('accepts an email channel, which uses no reported integration', async () => {
    Session.account = withIntegrations(noneEntitled())

    const diagnostics = await validate(new EmailAlertChannel('email-1', { address: 'ops@example.com' }))

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('does not check a reference to an existing channel', async () => {
    Session.account = withIntegrations(noneEntitled())

    const diagnostics = await validate(AlertChannel.fromId(123))

    expect(diagnostics.isFatal()).toBe(false)
  })

  it('reports every refused channel of a project in one run', async () => {
    Session.account = withIntegrations(noneEntitled())
    const project = Session.project!
    new PagerdutyAlertChannel('pagerduty-1', { serviceKey: 'key' })
    new SmsAlertChannel('sms-1', { phoneNumber: '+15550100' })
    new EmailAlertChannel('email-1', { address: 'ops@example.com' })

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)

    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations.map(({ title }) => title)).toEqual(expect.arrayContaining([
      '[PagerdutyAlertChannel:pagerduty-1] Integration not included in your plan',
      '[SmsAlertChannel:sms-1] Integration not included in your plan',
    ]))
    const refused = diagnostics.observations.filter(observation =>
      observation instanceof ConstructDiagnostic && observation.underlying instanceof IntegrationNotEntitledDiagnostic)
    expect(refused).toHaveLength(2)
    const messages = diagnostics.observations.map(({ message }) => message).join('\n')
    expect(messages).toContain(`Alert channel 'pagerduty-1' uses PagerDuty`)
    expect(messages).toContain(`Alert channel 'sms-1' uses SMS`)
  })
})
