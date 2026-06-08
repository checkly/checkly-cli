import chalk from 'chalk'
import type { AlertChannel, AlertChannelSubscription } from '../rest/alert-channels.js'
import type { AlertNotification } from '../rest/alert-notifications.js'
import {
  type OutputFormat,
  type DetailField,
  type ColumnDef,
  type CommandHint,
  renderDetailFields,
  renderCommandHints,
  renderTable,
  formatDate,
  truncateError,
  truncateToWidth,
} from './render.js'

export interface AlertChannelPaginationInfo {
  page: number
  limit: number
  total: number
}

function boolLabel (value: boolean | undefined, format: OutputFormat): string {
  if (value === undefined) return format === 'terminal' ? chalk.dim('-') : '-'
  if (format === 'md') return value ? 'yes' : 'no'
  return value ? chalk.green('yes') : chalk.dim('no')
}

function normalizeType (type: string | undefined): string {
  if (!type) return '-'
  return type.toLowerCase().replace(/_/g, ' ')
}

function redacted (format: OutputFormat): string {
  return format === 'terminal' ? chalk.dim('redacted') : 'redacted'
}

export function titleFromConfig (channel: AlertChannel): string {
  const config = channel.config ?? {}
  return channel.name
    ?? config.name
    ?? config.channel
    ?? config.address
    ?? config.serviceName
    ?? config.account
    ?? `${normalizeType(channel.type)} alert channel`
}

function targetFromConfig (channel: AlertChannel, format: OutputFormat): string {
  const config = channel.config ?? {}
  const secret = redacted(format)

  switch (channel.type) {
    case 'EMAIL':
      return String(config.address ?? '-')
    case 'SLACK':
      return config.channel ? String(config.channel) : `Slack webhook (${secret})`
    case 'SLACK_APP':
      return Array.isArray(config.slackChannels) ? config.slackChannels.join(', ') : '-'
    case 'WEBHOOK':
      return config.name ? String(config.name) : `Webhook URL (${secret})`
    case 'PAGERDUTY':
      return String(config.serviceName ?? config.account ?? `Service key (${secret})`)
    case 'OPSGENIE':
      return [
        config.name,
        config.region,
        config.priority,
      ].filter(Boolean).join(' / ') || `API key (${secret})`
    case 'SMS':
    case 'CALL':
      return String(config.name ?? config.number ?? config.phoneNumber ?? '-')
    default:
      return String(config.name ?? '-')
  }
}

function enabledEvents (channel: AlertChannel, format: OutputFormat): string {
  const events: string[] = []
  if (channel.sendFailure) events.push('failure')
  if (channel.sendRecovery) events.push('recovery')
  if (channel.sendDegraded) events.push('degraded')
  if (events.length === 0) return format === 'terminal' ? chalk.dim('-') : '-'
  return events.join(', ')
}

function sslExpiryLabel (channel: AlertChannel, format: OutputFormat): string {
  if (!channel.sslExpiry) return boolLabel(false, format)
  const threshold = channel.sslExpiryThreshold ?? 30
  return `yes (${threshold} days)`
}

function subscriptionCount (channel: AlertChannel): string {
  return String(channel.subscriptions?.length ?? 0)
}

function buildAlertChannelColumns (format: OutputFormat): ColumnDef<AlertChannel>[] {
  if (format === 'md') {
    return [
      { header: 'Type', value: c => normalizeType(c.type) },
      { header: 'Name', value: titleFromConfig },
      { header: 'Subscriptions', value: subscriptionCount },
      { header: 'Created', value: (c, fmt) => formatDate(c.created_at ?? c.createdAt, fmt) },
      { header: 'ID', value: c => String(c.id) },
    ]
  }

  const termWidth = process.stdout.columns || 120
  const nameWidth = Math.min(34, Math.floor(termWidth * 0.28))
  const targetWidth = Math.min(28, Math.floor(termWidth * 0.22))

  return [
    { header: 'Type', width: 14, value: c => normalizeType(c.type) },
    { header: 'Name', width: nameWidth, value: c => truncateToWidth(titleFromConfig(c), nameWidth - 2) },
    { header: 'Target', width: targetWidth, value: (c, fmt) => truncateToWidth(targetFromConfig(c, fmt), targetWidth - 2) },
    { header: 'Subs', width: 8, align: 'right', value: subscriptionCount },
    { header: 'Created', width: 24, value: (c, fmt) => formatDate(c.created_at ?? c.createdAt, fmt) },
    { header: 'ID', value: c => chalk.dim(String(c.id)) },
  ]
}

export function formatAlertChannels (channels: AlertChannel[], format: OutputFormat): string {
  return renderTable(buildAlertChannelColumns(format), channels, format)
}

export function formatAlertChannelPaginationInfo (pagination: AlertChannelPaginationInfo): string {
  const { page, limit, total } = pagination
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return chalk.dim(`Showing ${start}-${end} of ${total} alert channels (page ${page}/${totalPages})`)
}

export function formatAlertChannelNavigationHints (pagination: AlertChannelPaginationInfo): string {
  const { page, limit, total } = pagination
  const totalPages = Math.ceil(total / limit)
  const hints: CommandHint[] = []

  if (page < totalPages) {
    hints.push({ label: 'Next page', command: `checkly alert-channels list --page ${page + 1}` })
  }
  if (page > 1) {
    hints.push({ label: 'Prev page', command: `checkly alert-channels list --page ${page - 1}` })
  }
  hints.push({ label: 'View channel', command: 'checkly alert-channels get <id>' })
  hints.push({ label: 'View logs', command: 'checkly alert-channels logs <id> --status failed' })

  return renderCommandHints(hints, { gap: 1 })
}

const alertChannelDetailFields: DetailField<AlertChannel>[] = [
  { label: 'Type', value: c => normalizeType(c.type) },
  { label: 'Target', value: targetFromConfig },
  { label: 'Enabled events', value: enabledEvents },
  { label: 'SSL expiry', value: sslExpiryLabel },
  { label: 'Auto-subscribe', value: (c, fmt) => boolLabel(c.autoSubscribe, fmt) },
  { label: 'Subscriptions', value: subscriptionCount },
  { label: 'Created', value: (c, fmt) => formatDate(c.created_at ?? c.createdAt, fmt) },
  { label: 'Updated', value: (c, fmt) => formatDate(c.updated_at ?? c.updatedAt, fmt) },
  { label: 'ID', value: c => String(c.id) },
]

function subscriptionType (subscription: AlertChannelSubscription): string {
  if (subscription.checkId || subscription.check) return 'check'
  if (subscription.groupId || subscription.group) return 'group'
  return 'subscription'
}

function subscriptionName (subscription: AlertChannelSubscription, format: OutputFormat): string {
  const name = subscription.checkName ?? subscription.groupName ?? subscription.check?.name ?? subscription.group?.name
  if (name) return name
  return format === 'terminal' ? chalk.dim('-') : '-'
}

function subscriptionId (subscription: AlertChannelSubscription): string {
  return String(
    subscription.checkId
    ?? subscription.check?.id
    ?? subscription.groupId
    ?? subscription.group?.id
    ?? subscription.id
    ?? '-',
  )
}

function hasSubscriptionNames (subscriptions: AlertChannelSubscription[]): boolean {
  return subscriptions.some(subscription => Boolean(
    subscription.checkName
    ?? subscription.groupName
    ?? subscription.check?.name
    ?? subscription.group?.name,
  ))
}

function buildSubscriptionColumns (
  format: OutputFormat,
  subscriptions: AlertChannelSubscription[],
): ColumnDef<AlertChannelSubscription>[] {
  const includeName = hasSubscriptionNames(subscriptions)

  if (format === 'md') {
    const columns: ColumnDef<AlertChannelSubscription>[] = [
      { header: 'Type', value: subscriptionType },
      { header: 'ID', value: subscriptionId },
    ]
    if (includeName) {
      columns.splice(1, 0, { header: 'Name', value: (s, fmt) => subscriptionName(s, fmt) })
    }
    return columns
  }

  const columns: ColumnDef<AlertChannelSubscription>[] = [
    { header: 'Type', width: 14, value: subscriptionType },
    { header: 'ID', value: s => chalk.dim(subscriptionId(s)) },
  ]
  if (includeName) {
    columns.splice(1, 0, {
      header: 'Name',
      width: 32,
      value: (s, fmt) => truncateToWidth(subscriptionName(s, fmt), 30),
    })
  }
  return columns
}

export function formatAlertChannelSubscriptions (channel: AlertChannel, format: OutputFormat): string {
  const subscriptions = channel.subscriptions ?? []
  if (subscriptions.length === 0) return 'No subscriptions configured.'
  return renderTable(buildSubscriptionColumns(format, subscriptions), subscriptions, format)
}

export function formatAlertChannelDetail (channel: AlertChannel, format: OutputFormat): string {
  const lines: string[] = []
  lines.push(renderDetailFields(titleFromConfig(channel), alertChannelDetailFields, channel, format))

  lines.push('')
  if (format === 'md') {
    lines.push('## Subscriptions')
    lines.push('')
  } else {
    lines.push(chalk.bold('SUBSCRIPTIONS'))
  }
  lines.push(formatAlertChannelSubscriptions(channel, format))

  return lines.join('\n')
}

function formatNotificationStatus (status: string, format: OutputFormat): string {
  const label = status.toLowerCase().replace(/_/g, ' ')
  if (format === 'md') return label
  switch (status) {
    case 'SUCCESS':
      return chalk.green(label)
    case 'FAILURE':
    case 'RATE_LIMITED':
      return chalk.red(label)
    case 'IN_PROGRESS':
      return chalk.yellow(label)
    default:
      return chalk.dim(label)
  }
}

function notificationCheckLabel (log: AlertNotification): string {
  return String(
    log.check?.name
    ?? log.checkName
    ?? log.alertConfig?.checkName
    ?? log.checkId
    ?? '-',
  )
}

function notificationResultLabel (log: AlertNotification): string {
  return log.checkResultId ?? '-'
}

function notificationMessage (log: AlertNotification): string {
  return log.notificationResult ?? '-'
}

function buildAlertNotificationColumns (format: OutputFormat): ColumnDef<AlertNotification>[] {
  if (format === 'md') {
    return [
      { header: 'Time', value: l => formatDate(l.timestamp, format) },
      { header: 'Status', value: l => formatNotificationStatus(l.status, format) },
      { header: 'Type', value: l => normalizeType(l.type) },
      { header: 'Check', value: notificationCheckLabel },
      { header: 'Result', value: notificationResultLabel },
      { header: 'Message', value: l => truncateError(notificationMessage(l), 120) },
    ]
  }

  return [
    { header: 'Time', width: 22, value: l => formatDate(l.timestamp, format) },
    { header: 'Status', width: 14, value: l => formatNotificationStatus(l.status, format) },
    { header: 'Type', width: 12, value: l => normalizeType(l.type) },
    { header: 'Check', width: 28, value: l => truncateToWidth(notificationCheckLabel(l), 26) },
    { header: 'Result', width: 22, value: l => chalk.dim(truncateToWidth(notificationResultLabel(l), 20)) },
    { header: 'Message', value: l => truncateError(notificationMessage(l), 80) },
  ]
}

export function formatAlertNotificationLogs (logs: AlertNotification[], format: OutputFormat): string {
  if (logs.length === 0) return 'No alert channel logs found.'
  return renderTable(buildAlertNotificationColumns(format), logs, format)
}
