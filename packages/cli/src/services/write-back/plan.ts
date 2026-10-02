import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import * as constructs from '../../constructs/index.js'
import { AgenticCheck } from '../../constructs/agentic-check.js'
import { ApiCheck } from '../../constructs/api-check.js'
import type { Request } from '../../constructs/api-request.js'
import { BrowserCheck } from '../../constructs/browser-check.js'
import { CheckGroupV1 } from '../../constructs/check-group-v1.js'
import { CheckGroupV2 } from '../../constructs/check-group-v2.js'
import type { Construct } from '../../constructs/construct.js'
import { DnsMonitor } from '../../constructs/dns-monitor.js'
import type { DnsRequest } from '../../constructs/dns-request.js'
import { GrpcMonitor } from '../../constructs/grpc-monitor.js'
import type { GrpcConfig, GrpcRequest } from '../../constructs/grpc-request.js'
import { HeartbeatMonitor } from '../../constructs/heartbeat-monitor.js'
import { IcmpMonitor } from '../../constructs/icmp-monitor.js'
import type { IcmpRequest } from '../../constructs/icmp-request.js'
import { MultiStepCheck } from '../../constructs/multi-step-check.js'
import { PlaywrightCheck } from '../../constructs/playwright-check.js'
import type { Project, ProjectData } from '../../constructs/project.js'
import { SslMonitor } from '../../constructs/ssl-monitor.js'
import type { SslConfig, SslRequest } from '../../constructs/ssl-request.js'
import { TcpMonitor, type TcpRequest } from '../../constructs/tcp-monitor.js'
import { TracerouteMonitor } from '../../constructs/traceroute-monitor.js'
import type { TracerouteRequest } from '../../constructs/traceroute-request.js'
import { UrlMonitor } from '../../constructs/url-monitor.js'
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
 * source files, and applies them.
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

// Every check class takes these; a class whose props omit some (as its
// codegen's omitted props say) gets the rest.
const CHECK_RULES: Rule[] = [
  identity('name'), identity('description'), identity('activated'), identity('muted'), identity('shouldFail'),
  set('tags'), set('locations'), ...FREQUENCY_RULES, ...RETRY_RULES, ...alertRules('check'),
]
const omitting = (rules: readonly Rule[], props: readonly string[]): Rule[] =>
  rules.filter(rule => !props.includes(rule.target[0]))
// Only the classes extending RuntimeCheck take a runtime and environment
// variables; a monitor or an agentic check would drop them when synthesized.
const RUNTIME_CHECK_RULES: Rule[] = [identity('runtimeId'), identity('environmentVariables')]
const RESPONSE_TIME_RULES: Rule[] = [identity('degradedResponseTime'), identity('maxResponseTime')]

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
const HEARTBEAT_KEYS = ['period', 'periodUnit', 'grace', 'graceUnit']
const GROUP_RULES: Rule[] = [
  identity('name'), identity('activated'), identity('muted'), set('tags'), set('locations'), identity('concurrency'),
  identity('environmentVariables'), identity('runtimeId'),
  ...under('apiCheckDefaults', ['url', 'headers', 'queryParameters', 'basicAuth']),
  assertions('AssertionBuilder', 'apiCheckDefaults'),
  ...RETRY_RULES,
]

/**
 * The properties this module writes, per construct class: the ones whose
 * import-format spelling and construct spelling are both literals with the
 * same shape, and the ones the construct spells with a helper this module
 * can render (`frequency`, `retryStrategy`, `alertEscalationPolicy`, the
 * `assertions` of a request), and the SSL request whose wire keys map onto
 * the construct's (`SSL_REQUEST_RULES`). Anything else — references,
 * scripts, a request key the construct does not take — is left to the user.
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
  [BrowserCheck, [...CHECK_RULES, ...RUNTIME_CHECK_RULES]],
  [MultiStepCheck, [...CHECK_RULES, ...RUNTIME_CHECK_RULES]],
  [PlaywrightCheck, [...omitting(CHECK_RULES, PLAYWRIGHT_CHECK_OMITTED_PROPS), ...RUNTIME_CHECK_RULES]],
  [AgenticCheck, omitting(CHECK_RULES, AGENTIC_CHECK_OMITTED_PROPS)],
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
    ...CHECK_RULES, identity('degradedPacketLossThreshold'), identity('maxPacketLossThreshold'),
    ...under('request', ICMP_REQUEST_KEYS), assertions('IcmpAssertionBuilder', 'request'),
  ]],
  [HeartbeatMonitor, [
    ...CHECK_RULES,
    ...HEARTBEAT_KEYS.map(key => ({ pointer: ['heartbeat', key], target: [key], group: key.startsWith('period') ? 'period' : 'grace' })),
  ]],
  [CheckGroupV1, [...GROUP_RULES, ...alertRules('group')]],
  [CheckGroupV2, [...GROUP_RULES, ...alertRules('group-v2')]],
])

/** Paths that name another resource or a relation rather than a value of this one. */
const REFERENCE_PREFIXES = ['alertChannels', 'privateLocations', 'alertChannelSubscriptions', 'privateLocationAssignments', 'groupId']

/** Properties a remote change to is reported rather than written, with the reason. */
const NOT_WRITTEN: ReadonlyMap<string, string> = new Map([
  ['doubleCheck', 'replaced by retryStrategy; set the retry strategy in the code by hand'],
  ['runParallel', 'not a property this tool can update'],
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
    const primary = rule === undefined ? undefined : primaryOf(rule)
    if (rule === undefined || primary === undefined) {
      context.skip('not a property this tool can update', change.path)
      continue
    }
    const refused = rule.refuse?.(context.entry.before)
    if (refused !== undefined) {
      context.skip(refused, change.path)
      continue
    }
    const key = primary.target.join('.')
    const candidate = byPath.get(key) ?? { rule: primary, changes: [], local: [] }
    candidate.changes.push({ change, rule })
    byPath.set(key, candidate)
  }
  // A list is written whole from `before`, which knows nothing of an element
  // the code added and has not deployed; such an edit must not be erased.
  for (const change of context.entry.changes ?? []) {
    if (change.origin !== 'code') {
      continue
    }
    const segments = segmentsOf(change)
    const rule = segments === undefined ? undefined : ruleFor(segments)
    const candidate = rule === undefined ? undefined : byPath.get(rule.target.join('.'))
    if (candidate !== undefined) {
      candidate.local.push(change)
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
      context.skip(exportedNamesOf(construct).size === 0
        ? `${construct.constructor.name} is not a class from checkly/constructs`
        : 'updating the code is supported for checks and check groups only')
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
    const edits: FileWork['edits'] = []
    for (const candidate of candidates(context, rules)) {
      const found = valueFor(context, candidate, entry.before, blanked)
      if (found !== undefined) {
        edits.push({
          ...editFor(candidate.rule.target, found),
          replacesLocalEdit: candidate.changes.some(({ change }) => change.origin === 'both'),
          group: candidate.rule.group,
        })
      }
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
