import { describe, expect, it } from 'vitest'
import type { AlertChannel } from '../../rest/alert-channels.js'
import type { AlertNotification } from '../../rest/alert-notifications.js'
import { stripAnsi, visWidth } from '../render.js'
import {
  formatAlertChannelDetail,
  formatAlertChannels,
  formatAlertNotificationLogs,
} from '../alert-channels.js'

const baseChannel = {
  id: 123,
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
  sslExpiry: true,
  sslExpiryThreshold: 7,
  autoSubscribe: false,
  subscriptions: [
    { checkId: 'chk-1', check: { name: 'Homepage API' } },
    { groupId: 42, group: { name: 'Checkout group' } },
  ],
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-02T10:00:00.000Z',
} satisfies Partial<AlertChannel>

describe('formatAlertChannels', () => {
  it('renders a list of alert channels with type, name, subscription count, created date, and id', () => {
    const channels = [
      { ...baseChannel, type: 'EMAIL', config: { address: 'alerts@example.com' } },
      { ...baseChannel, id: 456, type: 'SLACK_APP', config: { slackChannels: ['#alerts', '@oncall'] } },
    ] as AlertChannel[]

    const result = stripAnsi(formatAlertChannels(channels, 'terminal'))

    expect(result).toContain('TYPE')
    expect(result).toContain('NAME')
    expect(result).toContain('SUBS')
    expect(result).toContain('email')
    expect(result).toContain('slack app')
    expect(result).toContain('alerts@example.com')
    expect(result).toContain('2')
    expect(result).toContain('2026-03-01 10:00:00 UTC')
    expect(result).toContain('123')
  })

  it('keeps terminal list rows within narrow terminal width', () => {
    const originalColumns = process.stdout.columns
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 80 })
    try {
      const channels = [
        {
          ...baseChannel,
          id: '0056ce7a-52f6-4315-a2d6-0392369abac5',
          name: 'Primary production incident response webhook',
          type: 'WEBHOOK',
          config: { name: 'Webhook with a verbose target name' },
        },
      ] as AlertChannel[]

      const result = stripAnsi(formatAlertChannels(channels, 'terminal'))

      for (const line of result.split('\n')) {
        expect(visWidth(line)).toBeLessThanOrEqual(80)
      }
    } finally {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
    }
  })
})

describe('formatAlertChannelDetail', () => {
  it.each([
    ['Email', { ...baseChannel, type: 'EMAIL', config: { address: 'alerts@example.com' } }],
    ['Slack', { ...baseChannel, type: 'SLACK', config: { url: 'https://hooks.slack.com/services/secret', channel: '#alerts' } }],
    ['Slack app', { ...baseChannel, type: 'SLACK_APP', config: { slackChannels: ['#alerts', '@oncall'] } }],
    ['Webhook', { ...baseChannel, type: 'WEBHOOK', config: { name: 'Deploy hook', url: 'https://example.com/webhook-secret' } }],
    ['PagerDuty', { ...baseChannel, type: 'PAGERDUTY', config: { serviceName: 'On-call', serviceKey: 'pd-secret' } }],
    ['Opsgenie', { ...baseChannel, type: 'OPSGENIE', config: { name: 'Ops', apiKey: 'ops-secret', region: 'EU', priority: 'P1' } }],
  ])('renders %s alert channel detail', (_label, channel) => {
    const result = stripAnsi(formatAlertChannelDetail(channel as AlertChannel, 'terminal'))

    expect(result).toContain('Enabled events:')
    expect(result).toContain('failure, recovery')
    expect(result).toContain('SSL expiry:')
    expect(result).toContain('yes (7 days)')
    expect(result).toContain('SUBSCRIPTIONS')
    expect(result).toContain('Homepage API')
    expect(result).toContain('123')
  })

  it.each(['terminal', 'md'] as const)('does not print secret-bearing config fields in %s output', format => {
    const channel: AlertChannel = {
      ...baseChannel,
      type: 'WEBHOOK',
      config: {
        name: 'Secure webhook',
        url: 'https://example.com/private-token',
        webhookSecret: 'signing-secret',
        headers: [{ key: 'Authorization', value: 'Bearer secret' }],
        apiKey: 'api-secret',
        serviceKey: 'service-secret',
      },
    } as AlertChannel

    const result = stripAnsi(formatAlertChannelDetail(channel, format))

    expect(result).toContain('Secure webhook')
    expect(result).not.toContain('https://example.com/private-token')
    expect(result).not.toContain('signing-secret')
    expect(result).not.toContain('Authorization')
    expect(result).not.toContain('api-secret')
    expect(result).not.toContain('service-secret')
  })

  it('renders an empty subscription state', () => {
    const channel: AlertChannel = {
      ...baseChannel,
      type: 'EMAIL',
      config: { address: 'alerts@example.com' },
      subscriptions: [],
    } as AlertChannel

    expect(stripAnsi(formatAlertChannelDetail(channel, 'terminal'))).toContain('No subscriptions configured.')
  })

  it('does not render an empty name column when subscriptions only include IDs', () => {
    const channel: AlertChannel = {
      ...baseChannel,
      type: 'EMAIL',
      config: { address: 'alerts@example.com' },
      subscriptions: [
        { checkId: '0056ce7a-52f6-4315-a2d6-0392369abac5' },
      ],
    } as AlertChannel

    const result = formatAlertChannelDetail(channel, 'md')

    expect(result).toContain('| Type | ID |')
    expect(result).not.toContain('| Type | Name | ID |')
    expect(result).not.toContain('| check | - |')
  })

  it('renders subscription names when the API provides top-level names', () => {
    const channel: AlertChannel = {
      ...baseChannel,
      type: 'EMAIL',
      config: { address: 'alerts@example.com' },
      subscriptions: [
        { checkId: '0056ce7a-52f6-4315-a2d6-0392369abac5', checkName: 'Homepage API' },
        { groupId: 42, groupName: 'Checkout group' },
      ],
    } as AlertChannel

    const result = formatAlertChannelDetail(channel, 'md')

    expect(result).toContain('| Type | Name | ID |')
    expect(result).toContain('| check | Homepage API | 0056ce7a-52f6-4315-a2d6-0392369abac5 |')
    expect(result).toContain('| group | Checkout group | 42 |')
  })
})

describe('formatAlertNotificationLogs', () => {
  it('renders success, failure, and in-progress statuses with truncated messages', () => {
    const longMessage = 'Webhook response body '.repeat(10)
    const logs: AlertNotification[] = [
      {
        id: 'log-1',
        type: 'EMAIL',
        status: 'SUCCESS',
        alertChannelId: 123,
        timestamp: '2026-03-01T10:00:00.000Z',
        checkId: 'chk-1',
        checkName: 'Homepage API',
        checkResultId: 'res-1',
        notificationResult: 'sent',
      },
      {
        id: 'log-2',
        type: 'WEBHOOK',
        status: 'FAILURE',
        alertChannelId: 123,
        timestamp: '2026-03-01T10:01:00.000Z',
        checkId: 'chk-2',
        checkResultId: 'res-2',
        notificationResult: longMessage,
      },
      {
        id: 'log-3',
        type: 'SLACK',
        status: 'IN_PROGRESS',
        alertChannelId: 123,
        timestamp: '2026-03-01T10:02:00.000Z',
        checkId: 'chk-3',
        checkResultId: 'res-3',
        notificationResult: null,
      },
    ]

    const result = stripAnsi(formatAlertNotificationLogs(logs, 'terminal'))

    expect(result).toContain('success')
    expect(result).toContain('failure')
    expect(result).toContain('in progress')
    expect(result).toContain('Webhook response body')
    expect(result).toContain('…')
    expect(result).not.toContain(longMessage)
  })

  it('renders an empty logs state', () => {
    expect(formatAlertNotificationLogs([], 'terminal')).toBe('No alert channel logs found.')
  })
})
