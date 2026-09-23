import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import * as constructs from '../../constructs/index.js'
import { AgenticCheck, type AgenticCheckProps } from '../../constructs/agentic-check.js'
import { ApiCheck, type ApiCheckDefaultConfig, type ApiCheckProps } from '../../constructs/api-check.js'
import type { Request } from '../../constructs/api-request.js'
import { BrowserCheck, type BrowserCheckProps } from '../../constructs/browser-check.js'
import type { CheckProps, RuntimeCheckProps } from '../../constructs/check.js'
import { CheckGroupV1, type CheckGroupV1Props } from '../../constructs/check-group-v1.js'
import { CheckGroupV2, type CheckGroupV2Props } from '../../constructs/check-group-v2.js'
import type { Construct } from '../../constructs/construct.js'
import type { AlertChannelProps } from '../../constructs/alert-channel.js'
import { Dashboard, type DashboardProps } from '../../constructs/dashboard.js'
import { EmailAlertChannel, type EmailAlertChannelProps } from '../../constructs/email-alert-channel.js'
import { IncidentioAlertChannel, type IncidentioAlertChannelProps } from '../../constructs/incidentio-alert-channel.js'
import { MaintenanceWindow, type MaintenanceWindowProps } from '../../constructs/maintenance-window.js'
import { MSTeamsAlertChannel, type MSTeamsAlertChannelProps } from '../../constructs/msteams-alert-channel.js'
import { OpsgenieAlertChannel, type OpsgenieAlertChannelProps } from '../../constructs/opsgenie-alert-channel.js'
import { PagerdutyAlertChannel, type PagerdutyAlertChannelProps } from '../../constructs/pagerduty-alert-channel.js'
import { PhoneCallAlertChannel, type PhoneCallAlertChannelProps } from '../../constructs/phone-call-alert-channel.js'
import { PrivateLocation, type PrivateLocationProps } from '../../constructs/private-location.js'
import { SlackAlertChannel, type SlackAlertChannelProps } from '../../constructs/slack-alert-channel.js'
import { SlackAppAlertChannel, type SlackAppAlertChannelProps } from '../../constructs/slack-app-alert-channel.js'
import { SmsAlertChannel, type SmsAlertChannelProps } from '../../constructs/sms-alert-channel.js'
import { StatusPage, type StatusPageProps } from '../../constructs/status-page.js'
import { StatusPageService, type StatusPageServiceProps } from '../../constructs/status-page-service.js'
import {
  StatusPageV3, type StatusPageV3Props, type StatusPageV3ThemeColorGroup, type StatusPageV3ThemeColors,
} from '../../constructs/status-page-v3.js'
import {
  StatusPageV3AutomationRule, type StatusPageV3AutomationRuleProps,
} from '../../constructs/status-page-v3-automation-rule.js'
import {
  StatusPageV3Component, type StatusPageV3ComponentProps, type StatusPageV3GroupComponentProps,
  type StatusPageV3ServiceComponentProps,
} from '../../constructs/status-page-v3-component.js'
import { TelegramAlertChannel, type TelegramAlertChannelProps } from '../../constructs/telegram-alert-channel.js'
import { WebhookAlertChannel, type WebhookAlertChannelProps } from '../../constructs/webhook-alert-channel.js'
import { DnsMonitor, type DnsMonitorProps } from '../../constructs/dns-monitor.js'
import type { DnsRequest } from '../../constructs/dns-request.js'
import { GrpcMonitor, type GrpcMonitorProps } from '../../constructs/grpc-monitor.js'
import type { GrpcConfig, GrpcRequest } from '../../constructs/grpc-request.js'
import { HeartbeatMonitor, type HeartbeatMonitorProps } from '../../constructs/heartbeat-monitor.js'
import { IcmpMonitor, type IcmpMonitorProps } from '../../constructs/icmp-monitor.js'
import type { IcmpRequest } from '../../constructs/icmp-request.js'
import type { MonitorProps } from '../../constructs/monitor.js'
import { MultiStepCheck, type MultiStepCheckProps } from '../../constructs/multi-step-check.js'
import { PlaywrightCheck, type PlaywrightCheckProps } from '../../constructs/playwright-check.js'
import type { Project, ProjectData } from '../../constructs/project.js'
import { SslMonitor, type SslMonitorProps } from '../../constructs/ssl-monitor.js'
import type { SslConfig, SslRequest } from '../../constructs/ssl-request.js'
import { TcpMonitor, type TcpMonitorProps, type TcpRequest } from '../../constructs/tcp-monitor.js'
import { TracerouteMonitor, type TracerouteMonitorProps } from '../../constructs/traceroute-monitor.js'
import type { TracerouteRequest } from '../../constructs/traceroute-request.js'
import { UrlMonitor, type UrlMonitorProps } from '../../constructs/url-monitor.js'
import type { UrlRequest } from '../../constructs/url-request.js'
import type { DiffChange, DiffEntry } from '../../rest/projects.js'
import { hasEscalationPolicy } from '../../constructs/alert-escalation-policy-codegen.js'
import { AGENTIC_CHECK_OMITTED_PROPS } from '../../constructs/internal/agentic-check-defaults.js'
import { PLAYWRIGHT_CHECK_OMITTED_PROPS } from '../../constructs/playwright-check-codegen.js'
import { blankRedacted, nodeAt, pointerSegments, UnshapeableError } from '../deploy-diff/import-shape.js'
import { applyEdits, readsBack, type SourceEdit } from './apply-edits.js'
import type { AssertionBuilderName } from './helper-edit.js'
import { findConstructOptions, parseSource, WriteBackSkipped } from './source-file.js'

/**
 * Turns the remote changes of a deploy plan into edits of the construct
 * source files, and applies them: checks, groups, alert channels, private
 * locations, dashboards, maintenance windows and status pages with their
 * services, components and automation rules.
 *
 * A remote change is a property that moved in the Checkly account since the
 * last deploy (`origin: 'remote'`, or `'both'` when the code moved too). The
 * value written is the account's current one, read from the entry's `before`
 * — the deployed resource in the import format, which a full-detail preview
 * carries — at the path the change names. The change list decides *which*
 * paths are written; `before` supplies the values, because a change can
 * carry a hash where `before` carries the text, and a set element change
 * names one element where the code holds the whole list.
 *
 * Only what can be written without guessing is written. A property has to
 * be one this module knows the construct's spelling of (the table below): a
 * literal of the same shape, or a helper expression — `Frequency.EVERY_*`,
 * `RetryStrategyBuilder`, `AlertEscalationBuilder`, an assertion builder —
 * that `helper-edit.ts` renders from the value the way `checkly import`
 * would; a value Checkly withholds — a credential the redaction table
 * blanks, a masked secret, a hash — is never written; and when the change's
 * own report of the current value disagrees with `before`, neither is
 * trusted. Everything refused is listed with its reason.
 */

export interface WriteBackOptions {
  diff: readonly DiffEntry[]
  project: Project
  /** The directory file names are shown relative to. */
  cwd: string
}

export interface WriteBackLine {
  /** The edited file, relative to `cwd`. */
  file: string
  type: string
  logicalId: string
  /** The construct property, dotted. */
  property: string
  /** The source text replaced, or undefined when the property was added. */
  previous?: string
  /** The source text written. */
  rendered: string
  /** Whether the code had moved too (`origin: 'both'`), so a local edit is being replaced. */
  replacesLocalEdit: boolean
}

export interface WriteBackPlan {
  /** Each file's new text, with the text it was planned from. */
  files: { path: string, text: string, original: string }[]
  applied: WriteBackLine[]
  skipped: string[]
  /** The helper classes added to each edited file's `checkly/constructs` import. */
  imports: { file: string, names: string[] }[]
}

/** How an import-format path maps onto a construct property. */
export interface Rule {
  /** Segments of the import-format pointer. */
  pointer: string[]
  /** The construct property path the pointer maps to. */
  target: string[]
  /** A list the API reports per element rather than whole; the code holds the whole list. */
  set?: boolean
  /** Properties that only mean something together are written together or not at all. */
  group?: string
  /** The helper the construct spells the property with; the value is written as its expression. */
  helper?:
    | { kind: 'frequency' | 'retryStrategy' }
    | { kind: 'alertEscalation', policy: AlertPolicyHolder }
    | { kind: 'assertions', builder: AssertionBuilderName }
  /** Further pointers whose `before` values the expression needs (`frequencyOffset` beside `frequency`). */
  reads?: string[][]
  /** Sibling keys of the property that make the edit wrong (`doubleCheck` beside `retryStrategy`). */
  unless?: string[]
  /**
   * A rule that routes the changes at its pointer onto another rule's
   * target (the one whose `target` it shares) rather than anchoring a
   * candidate of its own: `/frequencyOffset` belongs to `frequency`,
   * `/useGlobalAlertSettings` to `alertEscalationPolicy`, and a code-origin
   * `/doubleCheck` marks `retryStrategy` as locally changed.
   */
  companion?: true
  /** For a companion, the reason its changes are refused given the deployed resource, if they are. */
  refuse?: (before: unknown) => string | undefined
}

/**
 * Who holds the alert policy: a check or a v1 group spells "the global
 * policy" by having none, which nothing is ever removed from the code for;
 * a v2 group has the word `'global'` for it, and a group of either version
 * can also have no policy of its own while its checks keep theirs.
 */
type AlertPolicyHolder = 'check' | 'group' | 'group-v2'

const identity = (...segments: string[]): Rule => ({ pointer: segments, target: segments })
const set = (segment: string): Rule => ({ pointer: [segment], target: [segment], set: true })
const under = (parent: string | readonly string[], keys: readonly string[]): Rule[] =>
  keys.map(key => identity(...(typeof parent === 'string' ? [parent] : parent), key))
const assertions = (builder: AssertionBuilderName, ...parent: string[]): Rule =>
  ({ pointer: [...parent, 'assertions'], target: [...parent, 'assertions'], helper: { kind: 'assertions', builder } })

// The offset only means something for a sub-minute schedule; for any other
// the backend assigns one of its own and never reports it as a change.
const FREQUENCY_RULES: Rule[] = [
  { pointer: ['frequency'], target: ['frequency'], helper: { kind: 'frequency' }, reads: [['frequencyOffset']] },
  {
    pointer: ['frequencyOffset'],
    target: ['frequency'],
    companion: true,
    refuse: before => nodeAt(before, ['frequency']) === 0 ? undefined : 'the offset of a whole-minute schedule is assigned by Checkly',
  },
]
const RETRY_RULES: Rule[] = [
  { pointer: ['retryStrategy'], target: ['retryStrategy'], helper: { kind: 'retryStrategy' }, unless: ['doubleCheck'] },
  { pointer: ['doubleCheck'], target: ['retryStrategy'], companion: true },
]
const GLOBAL_POLICY = 'Checkly uses the global alert policy; remove alertEscalationPolicy from the code by hand'
const alertRules = (policy: AlertPolicyHolder): Rule[] => [
  {
    pointer: ['alertSettings'],
    target: ['alertEscalationPolicy'],
    helper: { kind: 'alertEscalation', policy },
    reads: [['useGlobalAlertSettings']],
  },
  {
    pointer: ['useGlobalAlertSettings'],
    target: ['alertEscalationPolicy'],
    companion: true,
    refuse: before => policy !== 'group-v2' && nodeAt(before, ['useGlobalAlertSettings']) === true ? GLOBAL_POLICY : undefined,
  },
]

// The keys each class writes are `as const` lists typed against the class's
// props, so that `_everyPropIsListed` below can hold the build to them: a
// key added to a props type has to be written or named as left out.
const CHECK_KEYS = ['name', 'description', 'activated', 'muted', 'shouldFail'] as const satisfies readonly (keyof CheckProps)[]
const CHECK_SET_KEYS = ['tags', 'locations'] as const satisfies readonly (keyof CheckProps)[]
const CHECK_HELPER_KEYS = ['frequency', 'retryStrategy', 'alertEscalationPolicy'] as const satisfies readonly (keyof CheckProps)[]
const CHECK_WRITTEN = [...CHECK_KEYS, ...CHECK_SET_KEYS, ...CHECK_HELPER_KEYS] as const
// Every check class takes these; a class whose props omit some (as its
// codegen's omitted props say) gets the rest.
const CHECK_RULES: Rule[] = [
  ...CHECK_KEYS.map(key => identity(key)), ...CHECK_SET_KEYS.map(set),
  ...FREQUENCY_RULES, ...RETRY_RULES, ...alertRules('check'),
]
const omitting = (rules: readonly Rule[], props: readonly string[]): Rule[] =>
  rules.filter(rule => !props.includes(rule.target[0]))
const omit = <K extends string, O extends string>(keys: readonly K[], omitted: readonly O[]): Exclude<K, O>[] =>
  keys.filter((key): key is Exclude<K, O> => !(omitted as readonly string[]).includes(key))
// Only the classes extending RuntimeCheck take a runtime and environment
// variables; a monitor or an agentic check would drop them when synthesized.
const RUNTIME_CHECK_KEYS = ['runtimeId', 'environmentVariables'] as const satisfies readonly (keyof RuntimeCheckProps)[]
const RUNTIME_CHECK_RULES: Rule[] = RUNTIME_CHECK_KEYS.map(key => identity(key))
const RESPONSE_TIME_KEYS = ['degradedResponseTime', 'maxResponseTime'] as const satisfies readonly (keyof ApiCheckProps)[]
const RESPONSE_TIME_RULES: Rule[] = RESPONSE_TIME_KEYS.map(key => identity(key))
const PACKET_LOSS_KEYS = [
  'degradedPacketLossThreshold', 'maxPacketLossThreshold',
] as const satisfies readonly (keyof IcmpMonitorProps)[]
const BROWSER_KEYS = ['sslCheckDomain', 'aiAutoRepairEnabled'] as const satisfies readonly (keyof BrowserCheckProps)[]
const MULTI_STEP_KEYS = ['aiAutoRepairEnabled'] as const satisfies readonly (keyof MultiStepCheckProps)[]
const AGENTIC_KEYS = ['prompt'] as const satisfies readonly (keyof AgenticCheckProps)[]

// The keys of each request type the account reports under the same name
// the construct uses, typed against the construct's interface so a renamed
// property fails the build; `Covers` below fails it for a key added to the
// interface but listed nowhere. `assertions` has its own helper rule.
const API_REQUEST_KEYS = [
  'url', 'method', 'ipFamily', 'followRedirects', 'skipSSL', 'body', 'bodyType', 'headers', 'queryParameters', 'basicAuth',
] as const satisfies readonly (keyof Request)[]
const URL_REQUEST_KEYS = ['url', 'ipFamily', 'followRedirects', 'skipSSL'] as const satisfies readonly (keyof UrlRequest)[]
const TCP_REQUEST_KEYS = ['hostname', 'port', 'data', 'ipFamily'] as const satisfies readonly (keyof TcpRequest)[]
const DNS_REQUEST_KEYS = [
  'recordType', 'query', 'nameServer', 'port', 'protocol',
] as const satisfies readonly (keyof DnsRequest)[]
const ICMP_REQUEST_KEYS = ['hostname', 'ipFamily', 'pingCount'] as const satisfies readonly (keyof IcmpRequest)[]
const GRPC_REQUEST_KEYS = ['url', 'port', 'ipFamily', 'skipSSL', 'timeout'] as const satisfies readonly (keyof GrpcRequest)[]
// `metadata` is never written — the account blanks every metadata value —
// but with a rule the refusal names that reason rather than a generic one.
const GRPC_CONFIG_KEYS = [
  'mode', 'tls', 'metadata', 'serviceDefinition', 'method', 'protoContent', 'message', 'service',
] as const satisfies readonly (keyof GrpcConfig)[]
const TRACEROUTE_REQUEST_KEYS = [
  'url', 'protocol', 'port', 'ipFamily', 'maxHops', 'maxUnknownHops', 'ptrLookup', 'timeout',
] as const satisfies readonly (keyof TracerouteRequest)[]
// A DNS monitor refuses a name server without a port and a port without a
// name server, so the two are written together or not at all.
const DNS_REQUEST_RULES: Rule[] = DNS_REQUEST_KEYS.map(key =>
  key === 'nameServer' || key === 'port' ? { ...identity('request', key), group: 'nameServer' } : identity('request', key))
/**
 * The SSL request is the one the account spells differently from the
 * construct: the wire shape nests the host, port and IP family under
 * `sslConfig`, names the handshake timeout in milliseconds, and lifts the
 * client certificate id to the request level.
 */
const SSL_NESTED_KEYS = ['hostname', 'port', 'ipFamily'] as const satisfies readonly (keyof SslRequest)[]
const SSL_CONFIG_KEYS = [
  'serverName', 'skipChainValidation', 'alertDaysBeforeExpiry', 'clientCertificateMode', 'securityBaseline',
] as const satisfies readonly (keyof SslConfig)[]
const SSL_REQUEST_RULES: Rule[] = [
  ...SSL_NESTED_KEYS.map(key => ({ pointer: ['request', 'sslConfig', key], target: ['request', key] })),
  ...under(['request', 'sslConfig'], SSL_CONFIG_KEYS),
  { pointer: ['request', 'sslConfig', 'handshakeTimeoutMs'], target: ['request', 'sslConfig', 'handshakeTimeout'] },
  { pointer: ['request', 'sslClientCertificateId'], target: ['request', 'sslConfig', 'sslClientCertificateId'] },
]

/**
 * `true` when every key of `T` is in `Listed`, `never` otherwise: a key a
 * construct's request gains has to be added to its list here, or named
 * below as one the write-back leaves out on purpose, before the build passes.
 */
type Covers<T, Listed extends PropertyKey> = Exclude<keyof T, Listed> extends never ? true : never
// A build-time assertion only; nothing reads it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _everyRequestKeyIsListed: [
  Covers<Request, typeof API_REQUEST_KEYS[number] | 'assertions'>,
  Covers<UrlRequest, typeof URL_REQUEST_KEYS[number] | 'assertions'>,
  Covers<TcpRequest, typeof TCP_REQUEST_KEYS[number] | 'assertions'>,
  Covers<DnsRequest, typeof DNS_REQUEST_KEYS[number] | 'assertions'>,
  Covers<IcmpRequest, typeof ICMP_REQUEST_KEYS[number] | 'assertions'>,
  Covers<GrpcRequest, typeof GRPC_REQUEST_KEYS[number] | 'grpcConfig' | 'assertions'>,
  Covers<GrpcConfig, typeof GRPC_CONFIG_KEYS[number]>,
  Covers<TracerouteRequest, typeof TRACEROUTE_REQUEST_KEYS[number] | 'assertions'>,
  Covers<SslRequest, typeof SSL_NESTED_KEYS[number] | 'sslConfig' | 'assertions'>,
  Covers<SslConfig, typeof SSL_CONFIG_KEYS[number] | 'handshakeTimeout' | 'sslClientCertificateId'>,
] = [true, true, true, true, true, true, true, true, true, true]
const HEARTBEAT_KEYS = ['period', 'periodUnit', 'grace', 'graceUnit'] as const satisfies readonly (keyof HeartbeatMonitorProps)[]
const GROUP_KEYS = [
  'name', 'activated', 'muted', 'concurrency', 'environmentVariables', 'runtimeId',
] as const satisfies readonly (keyof CheckGroupV1Props)[]
const GROUP_SET_KEYS = ['tags', 'locations'] as const satisfies readonly (keyof CheckGroupV1Props)[]
const GROUP_HELPER_KEYS = [
  'apiCheckDefaults', 'retryStrategy', 'alertEscalationPolicy',
] as const satisfies readonly (keyof CheckGroupV1Props)[]
const API_DEFAULT_KEYS = ['url', 'headers', 'queryParameters', 'basicAuth'] as const satisfies readonly (keyof ApiCheckDefaultConfig)[]
const GROUP_RULES: Rule[] = [
  ...GROUP_KEYS.map(key => identity(key)), ...GROUP_SET_KEYS.map(set),
  ...under('apiCheckDefaults', API_DEFAULT_KEYS), assertions('AssertionBuilder', 'apiCheckDefaults'),
  ...RETRY_RULES,
]

/**
 * A rule that refuses every change at its pointer with `reason` and writes
 * nothing: a companion with no primary, for a leaf the construct fixes or
 * builds from other props, so the refusal names why rather than saying
 * the property is unknown.
 */
const refusing = (pointer: string[], reason: string): Rule =>
  ({ pointer, target: pointer, companion: true, refuse: () => reason })
const FIXED = 'fixed by the construct; it cannot be changed in the code'

// An alert channel's own props are flat in the code and nested under
// `config` on the wire (`synthesize` moves them), so their rules map
// `config/<key>` onto the top-level prop. A credential key (`url`, `apiKey`,
// `serviceKey`, `webhookSecret`, the values of `headers` and
// `queryParameters`) is listed like any other: the account blanks it, so
// the redaction check refuses it by name, and a change at the leaf itself
// arrives flagged as a secret and never reaches a rule.
const config = (keys: readonly string[]): Rule[] => keys.map(key => ({ pointer: ['config', key], target: [key] }))
const ALERT_CHANNEL_KEYS = [
  'sendRecovery', 'sendFailure', 'sendDegraded', 'sslExpiry', 'sslExpiryThreshold',
] as const satisfies readonly (keyof AlertChannelProps)[]
const ALERT_CHANNEL_RULES: Rule[] = [
  ...ALERT_CHANNEL_KEYS.map(key => identity(key)),
  refusing(['type'], 'the channel type is the construct\'s class; change the class by hand'),
]
const EMAIL_KEYS = ['address'] as const satisfies readonly (keyof EmailAlertChannelProps)[]
const SLACK_KEYS = ['url', 'channel'] as const satisfies readonly (keyof SlackAlertChannelProps)[]
const SLACK_APP_KEYS = ['slackChannels'] as const satisfies readonly (keyof SlackAppAlertChannelProps)[]
const WEBHOOK_KEYS = [
  'name', 'webhookType', 'url', 'template', 'method', 'headers', 'queryParameters', 'webhookSecret',
] as const satisfies readonly (keyof WebhookAlertChannelProps)[]
const OPSGENIE_KEYS = ['name', 'apiKey', 'region', 'priority'] as const satisfies readonly (keyof OpsgenieAlertChannelProps)[]
const PAGERDUTY_KEYS = ['account', 'serviceName', 'serviceKey'] as const satisfies readonly (keyof PagerdutyAlertChannelProps)[]
// SMS and phone call channels spell the number as `phoneNumber`; the wire has `number`.
const PHONE_KEYS = ['name'] as const satisfies readonly (keyof SmsAlertChannelProps & keyof PhoneCallAlertChannelProps)[]
const PHONE_RULES: Rule[] = [...config(PHONE_KEYS), { pointer: ['config', 'number'], target: ['phoneNumber'] }]
// The webhook-based channels fix the webhook type and method, and spell the
// template as `payload`; Telegram packs its chat id, thread and payload
// into the template and its API key into the URL, and incident.io sends
// its API key as a header, none of which this module unpacks.
const WEBHOOK_FIXED_RULES: Rule[] = [refusing(['config', 'webhookType'], FIXED), refusing(['config', 'method'], FIXED)]
const TEMPLATE_RULE: Rule = { pointer: ['config', 'template'], target: ['payload'] }
const MSTEAMS_KEYS = ['name', 'url'] as const satisfies readonly (keyof MSTeamsAlertChannelProps)[]
const MSTEAMS_RULES: Rule[] = [...config(MSTEAMS_KEYS), TEMPLATE_RULE, ...WEBHOOK_FIXED_RULES]
const TELEGRAM_KEYS = ['name'] as const satisfies readonly (keyof TelegramAlertChannelProps)[]
const TELEGRAM_RULES: Rule[] = [
  ...config(TELEGRAM_KEYS),
  refusing(['config', 'template'], 'built from chatId, messageThreadId and payload; edit them by hand'),
  ...WEBHOOK_FIXED_RULES,
]
const INCIDENTIO_KEYS = ['name', 'url'] as const satisfies readonly (keyof IncidentioAlertChannelProps)[]
const INCIDENTIO_RULES: Rule[] = [
  ...config(INCIDENTIO_KEYS), TEMPLATE_RULE,
  refusing(['config', 'headers'], 'built from apiKey; edit it by hand'),
  ...WEBHOOK_FIXED_RULES,
]

const PRIVATE_LOCATION_KEYS = ['name', 'slugName', 'icon', 'proxyUrl'] as const satisfies readonly (keyof PrivateLocationProps)[]
// `customCSS` is a stylesheet the bundle sends as one string, which the
// construct takes as a file or content; it is refused, never written.
const DASHBOARD_KEYS = [
  'customUrl', 'customDomain', 'logo', 'favicon', 'link', 'header', 'description', 'width', 'refreshRate', 'paginate',
  'paginationRate', 'checksPerPage', 'useTagsAndOperator', 'hideTags', 'enableIncidents', 'expandChecks', 'showHeader',
  'isPrivate', 'showP95', 'showP99',
] as const satisfies readonly (keyof DashboardProps)[]
const DASHBOARD_SET_KEYS = ['tags'] as const satisfies readonly (keyof DashboardProps)[]
const DASHBOARD_RULES: Rule[] = [
  ...DASHBOARD_KEYS.map(key => identity(key)), ...DASHBOARD_SET_KEYS.map(set),
  refusing(['customCSS'], 'a stylesheet, not a property; edit the file or the content by hand'),
]
// The repeat settings only mean something together: an interval written
// without its unit would be a different schedule.
const MAINTENANCE_WINDOW_KEYS = ['name'] as const satisfies readonly (keyof MaintenanceWindowProps)[]
const MAINTENANCE_WINDOW_SET_KEYS = ['tags'] as const satisfies readonly (keyof MaintenanceWindowProps)[]
const REPEAT_KEYS = ['repeatInterval', 'repeatUnit'] as const satisfies readonly (keyof MaintenanceWindowProps)[]
const MAINTENANCE_WINDOW_RULES: Rule[] = [
  ...MAINTENANCE_WINDOW_KEYS.map(key => identity(key)), ...MAINTENANCE_WINDOW_SET_KEYS.map(set),
  ...REPEAT_KEYS.map(key => ({ ...identity(key), group: 'repeat' })),
]
// A v2 status page's cards hold references to its services.
const STATUS_PAGE_KEYS = [
  'name', 'url', 'customDomain', 'logo', 'redirectTo', 'favicon', 'defaultTheme',
] as const satisfies readonly (keyof StatusPageProps)[]
const STATUS_PAGE_RULES: Rule[] = [
  ...STATUS_PAGE_KEYS.map(key => identity(key)),
  refusing(['cards'], 'cards hold status page services; edit them by hand'),
]
const STATUS_PAGE_V3_KEYS = [
  'name', 'url', 'customDomain', 'description', 'logo', 'logoDark', 'redirectTo', 'favicon', 'defaultTheme',
  'privacyPolicyLink', 'termsOfServiceLink', 'supportLink', 'footerText', 'googleAnalyticsTag', 'allowIndexing',
] as const satisfies readonly (keyof StatusPageV3Props)[]
const THEMES = ['light', 'dark'] as const satisfies readonly (keyof StatusPageV3ThemeColors)[]
const THEME_COLOR_KEYS = [
  'bodyBackgroundColor', 'headerBackgroundColor', 'headerFontColor', 'titleFontColor', 'bodyFontColor',
  'bodyFontColorMuted', 'navigationFontColor', 'linkFontColor', 'cardBackgroundColor', 'borderColor',
  'primaryButtonBackgroundColor', 'primaryButtonFontColor',
] as const satisfies readonly (keyof StatusPageV3ThemeColorGroup)[]
// The account reports each colour as its own leaf; the code holds it under
// `themeColors.light` or `.dark`, which has to exist for a colour to be added.
const STATUS_PAGE_V3_RULES: Rule[] = [
  ...STATUS_PAGE_V3_KEYS.map(key => identity(key)),
  ...THEMES.flatMap(theme => under(['themeColors', theme], THEME_COLOR_KEYS)),
  refusing(['version'], FIXED),
]
const STATUS_PAGE_SERVICE_KEYS = ['name'] as const satisfies readonly (keyof StatusPageServiceProps)[]
// A component's `showHistoricalData` and `expandedByDefault` travel inside
// `configuration`; its page and parent are references.
const COMPONENT_KEYS = [
  'type', 'name', 'description', 'hidden', 'displayOrder',
] as const satisfies readonly (keyof StatusPageV3ComponentProps)[]
const COMPONENT_CONFIGURATION_KEYS = [
  'showHistoricalData', 'expandedByDefault',
] as const satisfies readonly (keyof StatusPageV3ComponentProps)[]
const COMPONENT_RULES: Rule[] = [
  ...COMPONENT_KEYS.map(key => identity(key)),
  ...COMPONENT_CONFIGURATION_KEYS.map(key => ({ pointer: ['configuration', key], target: [key] })),
]
const AUTOMATION_RULE_KEYS = [
  'name', 'enabled', 'firstUpdate', 'lastUpdate', 'notifySubscribers',
] as const satisfies readonly (keyof StatusPageV3AutomationRuleProps)[]
const AUTOMATION_RULE_SET_KEYS = ['tags'] as const satisfies readonly (keyof StatusPageV3AutomationRuleProps)[]
const AUTOMATION_RULE_RULES: Rule[] = [
  ...AUTOMATION_RULE_KEYS.map(key => identity(key)), ...AUTOMATION_RULE_SET_KEYS.map(set),
  { pointer: ['coolDownWindowMinutes'], target: ['coolDownMinutes'] },
]

// What each class writes, at the top level of its props. `request`,
// `apiCheckDefaults` and `themeColors` stand for every rule under them.
const API_WRITTEN = [...CHECK_WRITTEN, ...RUNTIME_CHECK_KEYS, ...RESPONSE_TIME_KEYS, 'request'] as const
const BROWSER_WRITTEN = [...CHECK_WRITTEN, ...RUNTIME_CHECK_KEYS, ...BROWSER_KEYS] as const
const MULTI_STEP_WRITTEN = [...CHECK_WRITTEN, ...RUNTIME_CHECK_KEYS, ...MULTI_STEP_KEYS] as const
const PLAYWRIGHT_WRITTEN = [...omit(CHECK_WRITTEN, PLAYWRIGHT_CHECK_OMITTED_PROPS), ...RUNTIME_CHECK_KEYS] as const
const AGENTIC_WRITTEN = [...omit(CHECK_WRITTEN, AGENTIC_CHECK_OMITTED_PROPS), ...AGENTIC_KEYS] as const
// The monitors with a request and response-time thresholds share one list.
const MONITOR_WRITTEN = [...CHECK_WRITTEN, ...RESPONSE_TIME_KEYS, 'request'] as const
const ICMP_WRITTEN = [...CHECK_WRITTEN, ...PACKET_LOSS_KEYS, 'request'] as const
const HEARTBEAT_WRITTEN = [...CHECK_WRITTEN, ...HEARTBEAT_KEYS] as const
const GROUP_WRITTEN = [...GROUP_KEYS, ...GROUP_SET_KEYS, ...GROUP_HELPER_KEYS] as const
const EMAIL_WRITTEN = [...ALERT_CHANNEL_KEYS, ...EMAIL_KEYS] as const
const SLACK_WRITTEN = [...ALERT_CHANNEL_KEYS, ...SLACK_KEYS] as const
const SLACK_APP_WRITTEN = [...ALERT_CHANNEL_KEYS, ...SLACK_APP_KEYS] as const
const WEBHOOK_WRITTEN = [...ALERT_CHANNEL_KEYS, ...WEBHOOK_KEYS] as const
const OPSGENIE_WRITTEN = [...ALERT_CHANNEL_KEYS, ...OPSGENIE_KEYS] as const
const PAGERDUTY_WRITTEN = [...ALERT_CHANNEL_KEYS, ...PAGERDUTY_KEYS] as const
const PHONE_WRITTEN = [...ALERT_CHANNEL_KEYS, ...PHONE_KEYS, 'phoneNumber'] as const
const MSTEAMS_WRITTEN = [...ALERT_CHANNEL_KEYS, ...MSTEAMS_KEYS, 'payload'] as const
const TELEGRAM_WRITTEN = [...ALERT_CHANNEL_KEYS, ...TELEGRAM_KEYS] as const
const INCIDENTIO_WRITTEN = [...ALERT_CHANNEL_KEYS, ...INCIDENTIO_KEYS, 'payload'] as const
const DASHBOARD_WRITTEN = [...DASHBOARD_KEYS, ...DASHBOARD_SET_KEYS] as const
const MAINTENANCE_WINDOW_WRITTEN = [...MAINTENANCE_WINDOW_KEYS, ...MAINTENANCE_WINDOW_SET_KEYS, ...REPEAT_KEYS] as const
const STATUS_PAGE_V3_WRITTEN = [...STATUS_PAGE_V3_KEYS, 'themeColors'] as const
const COMPONENT_WRITTEN = [...COMPONENT_KEYS, ...COMPONENT_CONFIGURATION_KEYS] as const
const AUTOMATION_RULE_WRITTEN = [...AUTOMATION_RULE_KEYS, ...AUTOMATION_RULE_SET_KEYS, 'coolDownMinutes'] as const

/**
 * The props keys the write-back leaves out on purpose, by reason; each
 * class names the reasons that apply to it. A key in none of them and in no
 * written list fails `_everyPropIsListed`.
 */
/** Names another resource; refused as `references another resource`. */
type ReferenceKey = 'alertChannels' | 'privateLocations' | 'group' | 'groupId'
/** Script or bundle content, which the plan reports with a cause rather than a value. */
type ContentKey = 'code' | 'setupScript' | 'tearDownScript' | 'localSetupScript' | 'localTearDownScript'
/** Reaches the account only through the Playwright code bundle. */
type BundleKey = 'playwrightConfigPath' | 'installCommand' | 'testCommand' | 'pwProjects' | 'pwTags' | 'include' | 'groupName'
/** Never sent to the account. */
type LocalOnlyKey = 'testOnly'
/** Reported with the reason `NOT_WRITTEN` or `refusal` gives. */
type NotWrittenKey = 'doubleCheck' | 'runParallel' | 'intent' | 'triggerIncident'
/** A group prop applied to its member checks, never a property of the group resource. */
type GroupMemberKey = 'frequency' | 'browserChecks' | 'multiStepChecks'
// Named per class below, writable in principle but not yet (`NOT_WRITTEN`
// says so): `engine` is one object sent as two leaves, `agentRuntime` holds
// a set, `playwrightConfig` has credential sections the account blanks to
// null and is usually inherited from the project config.
/** What every check class leaves out. */
type CheckLeftOut = ReferenceKey | LocalOnlyKey | NotWrittenKey
/** Packed into the Telegram channel's template and URL by the construct. */
type TelegramDerivedKey = 'chatId' | 'apiKey' | 'messageThreadId' | 'payload'
/** Sent by the incident.io channel as an authorization header. */
type IncidentioDerivedKey = 'apiKey'
/** A dashboard's stylesheet, a file or content the bundle sends as one string. */
type StylesheetKey = 'customCSS'
/** A maintenance window's dates, `Date` objects in the code. */
type DateKey = 'startsAt' | 'endsAt' | 'repeatEndsAt'
/** A status page prop that names other status page resources. */
type StatusPageReferenceKey = 'cards' | 'statusPage' | 'parent' | 'components'

/** `true` when every key of `Written` is a key of `T`, `never` otherwise. */
type Within<T, Written extends PropertyKey> = Exclude<Written, keyof T> extends never ? true : never
/** Both directions: every key of `T` is written or in `Left`, and every written key is one `T` has. */
type Exact<T, Written extends PropertyKey, Left extends PropertyKey> =
  Covers<T, Written | Left> extends true ? Within<T, Written> : never
// A build-time assertion only; nothing reads it. When it fails, the props
// type named at the failing position gained or lost a key: add it to the
// class's written list and a rule, or to the reasons above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _everyPropIsListed: [
  Exact<CheckProps, typeof CHECK_WRITTEN[number], CheckLeftOut>,
  Exact<RuntimeCheckProps, typeof CHECK_WRITTEN[number] | typeof RUNTIME_CHECK_KEYS[number], CheckLeftOut>,
  Exact<MonitorProps, typeof CHECK_WRITTEN[number], CheckLeftOut>,
  Exact<ApiCheckProps, typeof API_WRITTEN[number], CheckLeftOut | ContentKey>,
  Exact<BrowserCheckProps, typeof BROWSER_WRITTEN[number], CheckLeftOut | ContentKey | 'playwrightConfig'>,
  Exact<MultiStepCheckProps, typeof MULTI_STEP_WRITTEN[number], CheckLeftOut | ContentKey | 'playwrightConfig'>,
  Exact<PlaywrightCheckProps, typeof PLAYWRIGHT_WRITTEN[number], CheckLeftOut | BundleKey | 'engine'>,
  Exact<AgenticCheckProps, typeof AGENTIC_WRITTEN[number], CheckLeftOut | 'agentRuntime'>,
  Exact<UrlMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<TcpMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<DnsMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<GrpcMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<SslMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<TracerouteMonitorProps, typeof MONITOR_WRITTEN[number], CheckLeftOut>,
  Exact<IcmpMonitorProps, typeof ICMP_WRITTEN[number], CheckLeftOut>,
  Exact<HeartbeatMonitorProps, typeof HEARTBEAT_WRITTEN[number], CheckLeftOut>,
  Exact<CheckGroupV1Props, typeof GROUP_WRITTEN[number], CheckLeftOut | ContentKey | GroupMemberKey>,
  Exact<CheckGroupV2Props, typeof GROUP_WRITTEN[number], CheckLeftOut | ContentKey | GroupMemberKey>,
  Covers<ApiCheckDefaultConfig, typeof API_DEFAULT_KEYS[number] | 'assertions'>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
// The same for the other resource types.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _everyResourcePropIsListed: [
  Exact<AlertChannelProps, typeof ALERT_CHANNEL_KEYS[number], never>,
  Exact<EmailAlertChannelProps, typeof EMAIL_WRITTEN[number], never>,
  Exact<SlackAlertChannelProps, typeof SLACK_WRITTEN[number], never>,
  Exact<SlackAppAlertChannelProps, typeof SLACK_APP_WRITTEN[number], never>,
  Exact<WebhookAlertChannelProps, typeof WEBHOOK_WRITTEN[number], never>,
  Exact<OpsgenieAlertChannelProps, typeof OPSGENIE_WRITTEN[number], never>,
  Exact<PagerdutyAlertChannelProps, typeof PAGERDUTY_WRITTEN[number], never>,
  Exact<SmsAlertChannelProps, typeof PHONE_WRITTEN[number], never>,
  Exact<PhoneCallAlertChannelProps, typeof PHONE_WRITTEN[number], never>,
  Exact<MSTeamsAlertChannelProps, typeof MSTEAMS_WRITTEN[number], never>,
  Exact<TelegramAlertChannelProps, typeof TELEGRAM_WRITTEN[number], TelegramDerivedKey>,
  Exact<IncidentioAlertChannelProps, typeof INCIDENTIO_WRITTEN[number], IncidentioDerivedKey>,
  Exact<PrivateLocationProps, typeof PRIVATE_LOCATION_KEYS[number], never>,
  Exact<DashboardProps, typeof DASHBOARD_WRITTEN[number], StylesheetKey>,
  Exact<MaintenanceWindowProps, typeof MAINTENANCE_WINDOW_WRITTEN[number], DateKey>,
  Exact<StatusPageProps, typeof STATUS_PAGE_KEYS[number], StatusPageReferenceKey>,
  Exact<StatusPageV3Props, typeof STATUS_PAGE_V3_WRITTEN[number], never>,
  Covers<StatusPageV3ThemeColors, typeof THEMES[number]>,
  Covers<StatusPageV3ThemeColorGroup, typeof THEME_COLOR_KEYS[number]>,
  Exact<StatusPageServiceProps, typeof STATUS_PAGE_SERVICE_KEYS[number], never>,
  // The union's keys are the ones both members share; each member is held on its own.
  Exact<StatusPageV3ComponentProps, typeof COMPONENT_WRITTEN[number], StatusPageReferenceKey>,
  Exact<StatusPageV3ServiceComponentProps, typeof COMPONENT_WRITTEN[number], StatusPageReferenceKey>,
  Exact<StatusPageV3GroupComponentProps, typeof COMPONENT_WRITTEN[number], StatusPageReferenceKey>,
  Exact<StatusPageV3AutomationRuleProps, typeof AUTOMATION_RULE_WRITTEN[number], StatusPageReferenceKey>,
] = [
  true, true, true, true, true, true, true, true, true, true, true, true,
  true, true, true, true, true, true, true, true, true, true, true, true,
]

/**
 * The properties this module writes, per construct class: the ones whose
 * import-format spelling and construct spelling are both literals with the
 * same shape, and the ones the construct spells with a helper this module
 * can render (`frequency`, `retryStrategy`, `alertEscalationPolicy`, the
 * `assertions` of a request), and the SSL request whose wire keys map onto
 * the construct's (`SSL_REQUEST_RULES`). A rule may likewise map a wire
 * pointer onto a prop spelled or nested differently in the construct (an
 * alert channel's `config/<key>` onto its flat prop, a component's
 * `configuration/<key>`, `coolDownWindowMinutes` onto `coolDownMinutes`),
 * and a `refusing` rule names the reason for a leaf the construct fixes or
 * derives. Anything else — references, scripts, a request key the
 * construct does not take — is left to the user.
 *
 * Keyed by the exact class, not by `instanceof`: a class this table does not
 * name gets nothing rather than a base class's rules, so a construct that
 * omits one of them (`AgenticCheck` takes no `shouldFail` or
 * `retryStrategy`, `PlaywrightCheck` no `retryStrategy`, as their codegens'
 * omitted props say) can never be handed it. The spec checks that every
 * construct class `checkly/constructs` exports is listed here or excluded
 * on purpose, and that the omitted props are absent.
 */
/** A construct class, as a map key. */
export type ConstructClass = abstract new (...args: any[]) => Construct

export const RULES_BY_CLASS: ReadonlyMap<ConstructClass, readonly Rule[]> = new Map<ConstructClass, readonly Rule[]>([
  [ApiCheck, [
    ...CHECK_RULES, ...RUNTIME_CHECK_RULES, ...RESPONSE_TIME_RULES,
    ...under('request', API_REQUEST_KEYS), assertions('AssertionBuilder', 'request'),
  ]],
  [BrowserCheck, [...CHECK_RULES, ...RUNTIME_CHECK_RULES, ...BROWSER_KEYS.map(key => identity(key))]],
  [MultiStepCheck, [...CHECK_RULES, ...RUNTIME_CHECK_RULES, ...MULTI_STEP_KEYS.map(key => identity(key))]],
  [PlaywrightCheck, [...omitting(CHECK_RULES, PLAYWRIGHT_CHECK_OMITTED_PROPS), ...RUNTIME_CHECK_RULES]],
  [AgenticCheck, [...omitting(CHECK_RULES, AGENTIC_CHECK_OMITTED_PROPS), ...AGENTIC_KEYS.map(key => identity(key))]],
  [UrlMonitor, [
    ...CHECK_RULES, ...RESPONSE_TIME_RULES, ...under('request', URL_REQUEST_KEYS), assertions('UrlAssertionBuilder', 'request'),
  ]],
  [TcpMonitor, [
    ...CHECK_RULES, ...RESPONSE_TIME_RULES, ...under('request', TCP_REQUEST_KEYS), assertions('TcpAssertionBuilder', 'request'),
  ]],
  [DnsMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES, ...DNS_REQUEST_RULES, assertions('DnsAssertionBuilder', 'request')]],
  [GrpcMonitor, [
    ...CHECK_RULES, ...RESPONSE_TIME_RULES, ...under('request', GRPC_REQUEST_KEYS),
    ...under(['request', 'grpcConfig'], GRPC_CONFIG_KEYS), assertions('GrpcAssertionBuilder', 'request'),
  ]],
  [SslMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES, ...SSL_REQUEST_RULES, assertions('SslAssertionBuilder', 'request')]],
  [TracerouteMonitor, [
    ...CHECK_RULES, ...RESPONSE_TIME_RULES, ...under('request', TRACEROUTE_REQUEST_KEYS),
    assertions('TracerouteAssertionBuilder', 'request'),
  ]],
  [IcmpMonitor, [
    ...CHECK_RULES, ...PACKET_LOSS_KEYS.map(key => identity(key)),
    ...under('request', ICMP_REQUEST_KEYS), assertions('IcmpAssertionBuilder', 'request'),
  ]],
  [HeartbeatMonitor, [
    ...CHECK_RULES,
    ...HEARTBEAT_KEYS.map(key => ({ pointer: ['heartbeat', key], target: [key], group: key.startsWith('period') ? 'period' : 'grace' })),
  ]],
  [CheckGroupV1, [...GROUP_RULES, ...alertRules('group')]],
  [CheckGroupV2, [...GROUP_RULES, ...alertRules('group-v2')]],
  [EmailAlertChannel, [...ALERT_CHANNEL_RULES, ...config(EMAIL_KEYS)]],
  [SlackAlertChannel, [...ALERT_CHANNEL_RULES, ...config(SLACK_KEYS)]],
  [SlackAppAlertChannel, [...ALERT_CHANNEL_RULES, ...config(SLACK_APP_KEYS)]],
  [WebhookAlertChannel, [...ALERT_CHANNEL_RULES, ...config(WEBHOOK_KEYS)]],
  [OpsgenieAlertChannel, [...ALERT_CHANNEL_RULES, ...config(OPSGENIE_KEYS)]],
  [PagerdutyAlertChannel, [...ALERT_CHANNEL_RULES, ...config(PAGERDUTY_KEYS)]],
  [SmsAlertChannel, [...ALERT_CHANNEL_RULES, ...PHONE_RULES]],
  [PhoneCallAlertChannel, [...ALERT_CHANNEL_RULES, ...PHONE_RULES]],
  [MSTeamsAlertChannel, [...ALERT_CHANNEL_RULES, ...MSTEAMS_RULES]],
  [TelegramAlertChannel, [...ALERT_CHANNEL_RULES, ...TELEGRAM_RULES]],
  [IncidentioAlertChannel, [...ALERT_CHANNEL_RULES, ...INCIDENTIO_RULES]],
  [PrivateLocation, PRIVATE_LOCATION_KEYS.map(key => identity(key))],
  [Dashboard, DASHBOARD_RULES],
  [MaintenanceWindow, MAINTENANCE_WINDOW_RULES],
  [StatusPage, STATUS_PAGE_RULES],
  [StatusPageV3, STATUS_PAGE_V3_RULES],
  [StatusPageService, STATUS_PAGE_SERVICE_KEYS.map(key => identity(key))],
  [StatusPageV3Component, COMPONENT_RULES],
  [StatusPageV3AutomationRule, AUTOMATION_RULE_RULES],
])

/** The top-level props keys each class's rules write, as the build-time assertion above knows them; the spec holds `RULES_BY_CLASS` to it. */
export const WRITTEN_BY_CLASS: ReadonlyMap<ConstructClass, readonly string[]> =
  new Map<ConstructClass, readonly string[]>([
    [ApiCheck, API_WRITTEN], [BrowserCheck, BROWSER_WRITTEN], [MultiStepCheck, MULTI_STEP_WRITTEN],
    [PlaywrightCheck, PLAYWRIGHT_WRITTEN], [AgenticCheck, AGENTIC_WRITTEN],
    [UrlMonitor, MONITOR_WRITTEN], [TcpMonitor, MONITOR_WRITTEN], [DnsMonitor, MONITOR_WRITTEN],
    [GrpcMonitor, MONITOR_WRITTEN], [SslMonitor, MONITOR_WRITTEN], [TracerouteMonitor, MONITOR_WRITTEN],
    [IcmpMonitor, ICMP_WRITTEN],
    [HeartbeatMonitor, HEARTBEAT_WRITTEN], [CheckGroupV1, GROUP_WRITTEN], [CheckGroupV2, GROUP_WRITTEN],
    [EmailAlertChannel, EMAIL_WRITTEN], [SlackAlertChannel, SLACK_WRITTEN], [SlackAppAlertChannel, SLACK_APP_WRITTEN],
    [WebhookAlertChannel, WEBHOOK_WRITTEN], [OpsgenieAlertChannel, OPSGENIE_WRITTEN],
    [PagerdutyAlertChannel, PAGERDUTY_WRITTEN], [SmsAlertChannel, PHONE_WRITTEN],
    [PhoneCallAlertChannel, PHONE_WRITTEN],
    [MSTeamsAlertChannel, MSTEAMS_WRITTEN], [TelegramAlertChannel, TELEGRAM_WRITTEN],
    [IncidentioAlertChannel, INCIDENTIO_WRITTEN],
    [PrivateLocation, PRIVATE_LOCATION_KEYS], [Dashboard, DASHBOARD_WRITTEN],
    [MaintenanceWindow, MAINTENANCE_WINDOW_WRITTEN], [StatusPage, STATUS_PAGE_KEYS],
    [StatusPageV3, STATUS_PAGE_V3_WRITTEN], [StatusPageService, STATUS_PAGE_SERVICE_KEYS],
    [StatusPageV3Component, COMPONENT_WRITTEN], [StatusPageV3AutomationRule, AUTOMATION_RULE_WRITTEN],
  ])

/** Paths that name another resource or a relation rather than a value of this one. */
const REFERENCE_PREFIXES = [
  'alertChannels', 'privateLocations', 'alertChannelSubscriptions', 'privateLocationAssignments', 'groupId',
  'statusPageId', 'parentId', 'components',
]

/** Properties a remote change to is reported rather than written, with the reason. */
const NOT_WRITTEN: ReadonlyMap<string, string> = new Map([
  ['doubleCheck', 'replaced by retryStrategy; set the retry strategy in the code by hand'],
  ['runParallel', 'not a property this tool can update'],
  ['triggerIncident', 'Checkly does not report the incident trigger\'s settings; edit it by hand'],
  ['playwrightConfig', 'this tool does not update the Playwright config yet; set it in checkly.config.ts or on the check by hand'],
  ['engine', 'this tool does not update the engine yet; set it by hand'],
  ['engineVersion', 'this tool does not update the engine yet; set it by hand'],
  ['agentRuntime', 'this tool does not update agentRuntime yet; set it by hand'],
])

/** The names `checkly/constructs` exports for a construct's class; empty for a class of the user's own. */
function exportedNamesOf (construct: Construct): Set<string> {
  const names = new Set<string>()
  for (const [name, value] of Object.entries(constructs)) {
    if (value === construct.constructor) {
      names.add(name)
    }
  }
  return names
}

/** Whether a reported value is one of the API's stand-ins (`{ $hash }`, `{ $masked }`, `{ $json }`, `{ $ref }`) or holds one. */
function withheld (value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(withheld)
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.some(key => key === '$hash' || key === '$masked' || key === '$json' || key === '$ref')) {
      return true
    }
    return Object.values(value as object).some(withheld)
  }
  return false
}

const startsWith = (segments: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= segments.length && prefix.every((segment, i) => segments[i] === segment)

/**
 * The account-side value a change reports, if it reports one: `after` is the
 * current value and `before` the one at the last deploy, read from `remote`
 * when both sides moved. A missing key means the element is absent on that
 * side.
 */
function reported (change: DiffChange, side: 'before' | 'after'): { present: boolean, value: unknown } {
  const holder = change.origin === 'both' ? change.remote : change
  return { present: holder !== undefined && side in holder, value: holder?.[side] }
}

/**
 * Whether the change's own report of the account value agrees with what
 * `before` holds at the write path — the one guard on the assumption that
 * `before` is the live resource. A set element is checked by membership:
 * an element the change says is there must be in the list, one it says is
 * gone must not be. A withheld value cannot be compared and passes.
 */
function agrees (change: DiffChange, rule: Rule, remaining: readonly string[], raw: unknown): boolean {
  const current = reported(change, 'after')
  if (rule.set && remaining.length > 0) {
    if (!Array.isArray(raw)) {
      return false
    }
    const previous = reported(change, 'before')
    const holds = (value: unknown) => raw.some(element => isDeepStrictEqual(element, value))
    const added = !current.present || withheld(current.value) || holds(current.value)
    const removed = !previous.present || withheld(previous.value) || !holds(previous.value)
    return added && removed
  }
  // A path into a list that is not an index names an element by key, which
  // only a set does; nothing can be checked against it.
  if (remaining.length > 0 && Array.isArray(raw) && !/^\d+$/.test(remaining[0])) {
    return false
  }
  if (!current.present) {
    // A leaf the account no longer holds is either gone, or — when it was a
    // scalar or null — became a subtree whose leaves the sibling changes
    // report (a retry strategy where there was null, a policy that gained
    // its reminders). An object that is gone is gone.
    const held = nodeAt(raw, remaining)
    const previous = reported(change, 'before').value
    const wasLeaf = previous === null || typeof previous !== 'object'
    return held === undefined || (wasLeaf && held !== null && typeof held === 'object')
  }
  const held = nodeAt(raw, remaining)
  // The import format leaves out an optional key the account cleared
  // (`serverName`, `nameServer`, `data`, …), which the change reports as
  // null: at the rule's own leaf that is the same absence, and the writer
  // then refuses it as a value Checkly does not hold. Below the leaf the
  // parent would be written without the key, so the disagreement stands.
  const cleared = remaining.length === 0 && held === undefined && current.value === null
  return withheld(current.value) || cleared || isDeepStrictEqual(held, current.value)
}

interface Candidate {
  /** The rule of the target: never a companion. */
  rule: Rule
  /** Every remote change that named this target (more than one for a set, or through a companion), with the rule that matched it. */
  changes: { change: DiffChange, rule: Rule }[]
  /** Changes the code made under the same target since the last deploy, which `before` cannot hold. */
  local: DiffChange[]
}

/** A reason a change cannot be written, or undefined when it may be. */
function refusal (change: DiffChange, segments: readonly string[]): string | undefined {
  if (change.cause !== undefined) {
    return `${change.cause}: content, not a property`
  }
  if (change.secret === true) {
    return 'a secret changed; Checkly does not return its value'
  }
  if (REFERENCE_PREFIXES.some(prefix => segments[0] === prefix)) {
    return 'references another resource'
  }
  const notWritten = NOT_WRITTEN.get(segments[0])
  if (notWritten !== undefined) {
    return notWritten
  }
  if (segments[0] === 'intent') {
    return 'the intent is ordered by the author; edit it by hand'
  }
  return undefined
}

class EntryContext {
  readonly label: string

  constructor (readonly entry: DiffEntry, readonly skipped: string[]) {
    this.label = `${entry.type} ${entry.logicalId}`
  }

  skip (reason: string, property?: string): void {
    this.skipped.push(property === undefined ? `${this.label}: ${reason}` : `${this.label} ${property}: ${reason}`)
  }
}

/** The remote changes of an entry grouped by the construct path they write, or the reasons they cannot be. */
function candidates (context: EntryContext, rules: readonly Rule[]): Candidate[] {
  const byPath = new Map<string, Candidate>()
  const segmentsOf = (change: DiffChange): string[] | undefined => {
    try {
      return pointerSegments(change.path)
    } catch {
      return undefined
    }
  }
  const ruleFor = (segments: readonly string[]): Rule | undefined =>
    rules.find(rule => startsWith(segments, rule.pointer))
  const primaryOf = (rule: Rule): Rule | undefined => rule.companion === undefined
    ? rule
    : rules.find(other => other.companion === undefined && isDeepStrictEqual(other.target, rule.target))
  for (const change of context.entry.changes ?? []) {
    if (change.origin !== 'remote' && change.origin !== 'both') {
      continue
    }
    const segments = segmentsOf(change)
    if (segments === undefined) {
      context.skip('not a property path', change.path)
      continue
    }
    const reason = refusal(change, segments)
    if (reason !== undefined) {
      context.skip(reason, change.path)
      continue
    }
    const rule = ruleFor(segments)
    // A refusing rule has a reason of its own and may have no primary.
    const refused = rule?.refuse?.(context.entry.before)
    if (refused !== undefined) {
      context.skip(refused, change.path)
      continue
    }
    const primary = rule === undefined ? undefined : primaryOf(rule)
    if (rule === undefined || primary === undefined) {
      context.skip('not a property this tool can update', change.path)
      continue
    }
    const key = primary.target.join('.')
    const candidate = byPath.get(key) ?? { rule: primary, changes: [], local: [] }
    candidate.changes.push({ change, rule })
    byPath.set(key, candidate)
  }
  // A list is written whole from `before`, which knows nothing of an element
  // the code added and has not deployed; such an edit must not be erased.
  // A property written together with others (`group`) is local when any of
  // them is: an interval written next to a unit the code changed would be a
  // schedule nobody set.
  for (const change of context.entry.changes ?? []) {
    if (change.origin !== 'code') {
      continue
    }
    const segments = segmentsOf(change)
    const rule = segments === undefined ? undefined : ruleFor(segments)
    if (rule === undefined) {
      continue
    }
    for (const candidate of byPath.values()) {
      if (candidate.rule === primaryOf(rule) || (rule.group !== undefined && candidate.rule.group === rule.group)) {
        candidate.local.push(change)
      }
    }
  }
  return [...byPath.values()]
}

/**
 * The value `before` holds at a candidate's path, or the reason it cannot be
 * written: the redaction table blanked something under it, the API withheld
 * it, or a change disagrees with it.
 */
interface Found {
  value: unknown
  helper?: Rule['helper']
  unless?: string[]
  literalAlternative?: unknown
}

function valueFor (
  context: EntryContext,
  candidate: Candidate,
  before: unknown,
  blanked: unknown,
): Found | undefined {
  const { rule } = candidate
  const property = rule.target.join('.')
  if (candidate.local.length > 0) {
    context.skip('your code also changed it since the last deploy; merge by hand', property)
    return undefined
  }
  for (const segments of [rule.pointer, ...(rule.reads ?? [])]) {
    const held = nodeAt(before, segments)
    if (!isDeepStrictEqual(held, nodeAt(blanked, segments))) {
      context.skip('contains a locked or secret value that Checkly does not return', property)
      return undefined
    }
    if (withheld(held)) {
      context.skip('contains a value Checkly does not return in full', property)
      return undefined
    }
  }
  for (const { change, rule: own } of candidate.changes) {
    if (change.origin === 'both' && change.remote === undefined) {
      context.skip('Checkly did not report the value it holds', property)
      return undefined
    }
    const remaining = pointerSegments(change.path).slice(own.pointer.length)
    if (!agrees(change, own, remaining, nodeAt(before, own.pointer))) {
      context.skip('Checkly reported two different current values', property)
      return undefined
    }
  }
  const raw = nodeAt(before, rule.pointer)
  const found: Found = { value: raw, helper: rule.helper, unless: rule.unless }
  switch (rule.helper?.kind) {
    case 'frequency':
      // A whole-minute schedule stays a number where the code spells it as
      // one; the helper form is for a sub-minute schedule, or a code that
      // uses the helper already.
      found.value = { frequency: raw, frequencyOffset: nodeAt(before, ['frequencyOffset']) }
      found.literalAlternative = typeof raw === 'number' && raw > 0 ? raw : undefined
      break
    case 'alertEscalation': {
      const { policy } = rule.helper
      if (nodeAt(before, ['useGlobalAlertSettings']) === true) {
        if (policy !== 'group-v2') {
          context.skip(GLOBAL_POLICY, property)
          return undefined
        }
        found.value = 'global'
        break
      }
      if (!hasEscalationPolicy(raw)) {
        // A group can have no policy of its own while its checks keep
        // theirs, which the construct spells by having none.
        context.skip(policy === 'check'
          ? 'Checkly did not report an alert policy'
          : 'the group has no alert policy of its own; remove alertEscalationPolicy from the code by hand', property)
        return undefined
      }
      break
    }
    default:
      break
  }
  return found
}

/** The edit for a found value: a literal one, or the helper one the rule asks for. */
function editFor (path: string[], found: Found): SourceEdit {
  const { value, helper, unless, literalAlternative } = found
  if (helper === undefined) {
    return { path, value }
  }
  return helper.kind === 'assertions'
    ? { path, value, helper: 'assertions', builder: helper.builder, unless, literalAlternative }
    : { path, value, helper: helper.kind, unless, literalAlternative }
}

interface FileWork {
  /** The names `checkly/constructs` exports for the construct's class. */
  names: ReadonlySet<string>
  context: EntryContext
  edits: (SourceEdit & { replacesLocalEdit: boolean, group?: string })[]
}

/**
 * Whether the plan holds at least one change the planner would try to
 * write: a remote change on a construct of a known class, at a path the
 * class's table covers. Cheap enough to decide whether to offer the
 * write-back at all, without reading any file.
 */
export function hasWritableChanges (diff: readonly DiffEntry[], project: Project): boolean {
  return diff.some(entry => {
    if (entry.foldedInto !== undefined || entry.before === undefined) {
      return false
    }
    const construct: Construct | undefined = project.data[entry.type as keyof ProjectData]?.[entry.logicalId]
    const rules = construct === undefined ? undefined : RULES_BY_CLASS.get(construct.constructor as ConstructClass)
    if (rules === undefined || construct?.checkFileAbsolutePath === undefined) {
      return false
    }
    return candidates(new EntryContext(entry, []), rules).length > 0
  })
}

export async function planWriteBack ({ diff, project, cwd }: WriteBackOptions): Promise<WriteBackPlan> {
  const skipped: string[] = []
  const byFile = new Map<string, FileWork[]>()

  for (const entry of diff) {
    if (entry.foldedInto !== undefined || !(entry.changes ?? []).some(c => c.origin === 'remote' || c.origin === 'both')) {
      continue
    }
    const context = new EntryContext(entry, skipped)
    const construct: Construct | undefined = project.data[entry.type as keyof ProjectData]?.[entry.logicalId]
    if (construct === undefined) {
      // A resource the deploy removes has no construct to edit; only one the
      // code still declares is worth a line.
      if (String(entry.action).toUpperCase() === 'UPDATE') {
        context.skip('not found in the project')
      }
      continue
    }
    const rules = RULES_BY_CLASS.get(construct.constructor as ConstructClass)
    if (rules === undefined) {
      // A reference to a resource of another project, or a relation, has
      // no properties of its own; a class of the user's own is not known.
      context.skip(exportedNamesOf(construct).size === 0
        ? `${construct.constructor.name} is not a class from checkly/constructs`
        : `${construct.constructor.name} has no properties this tool can update`)
      continue
    }
    if (construct.checkFileAbsolutePath === undefined) {
      context.skip('the file that declares it is not known')
      continue
    }
    if (entry.before === undefined) {
      context.skip('Checkly did not report its current state')
      continue
    }
    let blanked: unknown
    try {
      blanked = blankRedacted(entry.before, entry.redactions)
    } catch (err) {
      if (err instanceof UnshapeableError) {
        context.skip('Checkly did not report which of its values are secret')
        continue
      }
      throw err
    }
    const found = candidates(context, rules).map(candidate => ({
      candidate, found: valueFor(context, candidate, entry.before, blanked),
    }))
    // A member of a group refused here takes the rest of its group with it,
    // as one the splicer refuses does below.
    const refusedGroups = new Set(found.filter(entry => entry.found === undefined)
      .map(entry => entry.candidate.rule.group))
    const edits: FileWork['edits'] = []
    for (const { candidate, found: value } of found) {
      const { group, target } = candidate.rule
      if (value === undefined) {
        continue
      }
      if (group !== undefined && refusedGroups.has(group)) {
        const others = found.filter(entry => entry.candidate.rule.group === group && entry.candidate !== candidate)
        context.skip(`written together with ${others.map(entry => entry.candidate.rule.target.join('.')).join(', ')}`, target.join('.'))
        continue
      }
      edits.push({
        ...editFor(target, value),
        replacesLocalEdit: candidate.changes.some(({ change }) => change.origin === 'both'),
        group,
      })
    }
    if (edits.length === 0) {
      continue
    }
    const work = byFile.get(construct.checkFileAbsolutePath) ?? []
    work.push({ names: exportedNamesOf(construct), context, edits })
    byFile.set(construct.checkFileAbsolutePath, work)
  }

  const files: WriteBackPlan['files'] = []
  const applied: WriteBackLine[] = []
  const imports: WriteBackPlan['imports'] = []
  for (const [filePath, work] of byFile) {
    const file = path.relative(cwd, filePath)
    let text: string
    try {
      text = await fs.readFile(filePath, 'utf8')
    } catch (err: any) {
      for (const { context } of work) {
        context.skip(`could not read ${file}: ${err.message}`)
      }
      continue
    }
    const original = text
    const lines: WriteBackLine[] = []
    const added = new Set<string>()
    // Constructs of one file are edited one after another, each against a
    // fresh parse of the text the previous one produced, so no range is stale.
    for (const { names, context, edits } of work) {
      const logicalId = context.entry.logicalId
      let source
      let options
      try {
        source = parseSource(filePath, text)
        options = findConstructOptions(source, logicalId, names)
      } catch (err) {
        if (!(err instanceof WriteBackSkipped)) {
          throw err
        }
        context.skip(`${file}: ${err.message}`)
        continue
      }
      try {
        // A member of a group the splicer refuses takes the rest of its group
        // with it: a period without its unit would mean something else.
        let attempt = edits
        let result = applyEdits(source, options, attempt)
        for (;;) {
          const refused = new Set(result.skipped.map(skip => attempt.find(edit => edit.path === skip.path)?.group)
            .filter((group): group is string => group !== undefined))
          const dropped = attempt.filter(edit => edit.group !== undefined && refused.has(edit.group)
            && !result.skipped.some(skip => skip.path === edit.path))
          if (dropped.length === 0) {
            break
          }
          for (const edit of dropped) {
            context.skip(`written together with ${attempt.filter(e => e.group === edit.group && e !== edit).map(e => e.path.join('.')).join(', ')}`, edit.path.join('.'))
          }
          attempt = attempt.filter(edit => !dropped.includes(edit))
          result = applyEdits(source, options, attempt)
        }
        for (const skip of result.skipped) {
          context.skip(skip.reason, skip.path.join('.'))
        }
        if (result.applied.length === 0) {
          continue
        }
        // What was written must read back as what was meant, or the file is
        // left alone: a splice that produced something else is a bug, and the
        // user's source is not the place to find out.
        const reparsed = findConstructOptions(parseSource(filePath, result.text), logicalId, names)
        for (const edit of result.applied) {
          if (!readsBack(reparsed, edit)) {
            throw new WriteBackSkipped(`the edited file did not read back as expected at ${edit.path.join('.')}`)
          }
        }
        text = result.text
        result.imports.forEach(name => added.add(name))
        for (const edit of result.applied) {
          lines.push({
            file,
            type: context.entry.type,
            logicalId,
            property: edit.path.join('.'),
            previous: edit.previous,
            rendered: edit.rendered,
            replacesLocalEdit: edits.find(e => e.path === edit.path)?.replacesLocalEdit ?? false,
          })
        }
      } catch (err) {
        if (!(err instanceof WriteBackSkipped)) {
          throw err
        }
        // A file that cannot be trusted after one construct's edits is not
        // written at all, whatever the others produced.
        for (const { context: other } of work) {
          other.skip(`${file}: ${err.message}`)
        }
        text = original
        lines.length = 0
        added.clear()
        break
      }
    }
    if (text !== original) {
      files.push({ path: filePath, text, original })
      applied.push(...lines)
      if (added.size > 0) {
        imports.push({ file, names: [...added] })
      }
    }
  }
  return { files, applied, skipped, imports }
}

/**
 * Writes every planned file through a temporary file in the same directory,
 * flushed to disk and then renamed over the target, so an interrupted write
 * leaves the old file or the new one rather than a torn one. The target is
 * the file itself, not a symlink to it, and it keeps its mode.
 *
 * @throws Error naming the files already rewritten when a later one fails.
 */
export async function applyWriteBack (plan: WriteBackPlan): Promise<void> {
  const written: string[] = []
  for (const file of plan.files) {
    let temporary: string | undefined
    try {
      const target = await fs.realpath(file.path)
      // The plan was made from what the file held then; a file edited since
      // is not overwritten with a rewrite of its older self.
      if (await fs.readFile(target, 'utf8') !== file.original) {
        throw new Error('the file changed since the plan was made')
      }
      const { mode } = await fs.stat(target)
      temporary = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`
      const handle = await fs.open(temporary, 'wx')
      let failed = false
      try {
        // Set after opening, since the mode passed to open is filtered by
        // the umask; a filesystem without modes keeps its own.
        await handle.chmod(mode).catch(() => undefined)
        await handle.writeFile(file.text, 'utf8')
        await handle.sync()
      } catch (err) {
        failed = true
        throw err
      } finally {
        // On the way out with an error, the error is the one to report; on
        // success, a close that fails is the write failing late.
        await handle.close().catch(err => {
          if (!failed) {
            throw err
          }
        })
      }
      await fs.rename(temporary, target)
      written.push(file.path)
    } catch (err: any) {
      if (temporary !== undefined) {
        await fs.rm(temporary, { force: true }).catch(() => undefined)
      }
      const done = written.length === 0 ? 'No file was changed.' : `Already updated: ${written.join(', ')}.`
      throw new Error(`Could not write ${file.path}: ${err.message} ${done}`, { cause: err })
    }
  }
}
