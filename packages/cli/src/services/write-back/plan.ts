import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import * as constructs from '../../constructs/index.js'
import { AgenticCheck } from '../../constructs/agentic-check.js'
import { ApiCheck } from '../../constructs/api-check.js'
import { BrowserCheck } from '../../constructs/browser-check.js'
import { CheckGroupV1 } from '../../constructs/check-group-v1.js'
import { CheckGroupV2 } from '../../constructs/check-group-v2.js'
import type { Construct } from '../../constructs/construct.js'
import { DnsMonitor } from '../../constructs/dns-monitor.js'
import { GrpcMonitor } from '../../constructs/grpc-monitor.js'
import { HeartbeatMonitor } from '../../constructs/heartbeat-monitor.js'
import { IcmpMonitor } from '../../constructs/icmp-monitor.js'
import { MultiStepCheck } from '../../constructs/multi-step-check.js'
import { PlaywrightCheck } from '../../constructs/playwright-check.js'
import type { Project, ProjectData } from '../../constructs/project.js'
import { SslMonitor } from '../../constructs/ssl-monitor.js'
import { TcpMonitor } from '../../constructs/tcp-monitor.js'
import { TracerouteMonitor } from '../../constructs/traceroute-monitor.js'
import { UrlMonitor } from '../../constructs/url-monitor.js'
import type { DiffChange, DiffEntry } from '../../rest/projects.js'
import { blankRedacted, nodeAt, pointerSegments, UnshapeableError } from '../deploy-diff/import-shape.js'
import { isShapeChangePath } from '../deploy-diff/shape-changes.js'
import { applyLiteralEdits, evaluateLiteral, type LiteralEdit, resolvePath } from './literal-edit.js'
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
 * be one this module knows the construct spells as a literal (the table
 * below); a value Checkly withholds — a credential the redaction table
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
}

/** How an import-format path maps onto a construct property. */
interface Rule {
  /** Segments of the import-format pointer. */
  pointer: string[]
  /** The construct property path the pointer maps to. */
  target: string[]
  /** A list the API reports per element rather than whole; the code holds the whole list. */
  set?: boolean
  /** Properties that only mean something together are written together or not at all. */
  group?: string
}

const identity = (...segments: string[]): Rule => ({ pointer: segments, target: segments })
const set = (segment: string): Rule => ({ pointer: [segment], target: [segment], set: true })
const under = (parent: string, keys: string[]): Rule[] => keys.map(key => identity(parent, key))

const CHECK_RULES: Rule[] = [
  identity('name'), identity('description'), identity('activated'), identity('muted'), identity('shouldFail'),
  set('tags'), set('locations'), identity('frequency'),
]
const RESPONSE_TIME_RULES: Rule[] = [identity('degradedResponseTime'), identity('maxResponseTime')]
// `assertions` is left out on purpose: the construct spells them with
// `AssertionBuilder`, and the wire form carries keys the type does not.
const API_REQUEST_KEYS = [
  'url', 'method', 'ipFamily', 'followRedirects', 'skipSSL', 'body', 'bodyType', 'headers', 'queryParameters', 'basicAuth',
]
const URL_REQUEST_KEYS = ['url', 'ipFamily', 'followRedirects', 'skipSSL']
const HEARTBEAT_KEYS = ['period', 'periodUnit', 'grace', 'graceUnit']
const GROUP_RULES: Rule[] = [
  identity('name'), identity('activated'), identity('muted'), set('tags'), set('locations'), identity('concurrency'),
  identity('environmentVariables'),
  ...under('apiCheckDefaults', ['url', 'headers', 'queryParameters', 'basicAuth']),
]

/**
 * The properties this module writes, per construct class: the ones whose
 * import-format spelling and construct spelling are both literals with the
 * same shape. `frequency` is included because the construct takes a number,
 * with the sub-minute case excluded below. Anything else — references,
 * helper-built values such as retry strategies, scripts, the TCP/DNS/ICMP
 * request whose keys differ between the two spellings — is left to the user.
 *
 * Keyed by the exact class, not by `instanceof`: a class this table does not
 * name gets nothing rather than a base class's rules, so a construct that
 * omits one of them (`AgenticCheck` takes neither `shouldFail` nor
 * `frequency`) can never be handed it. The spec checks that every construct
 * class `checkly/constructs` exports is listed here or excluded on purpose.
 */
/** A construct class, as a map key. */
export type ConstructClass = abstract new (...args: any[]) => Construct

export const RULES_BY_CLASS: ReadonlyMap<ConstructClass, readonly Rule[]> = new Map<ConstructClass, readonly Rule[]>([
  [ApiCheck, [...CHECK_RULES, identity('environmentVariables'), ...RESPONSE_TIME_RULES, ...under('request', API_REQUEST_KEYS)]],
  [BrowserCheck, [...CHECK_RULES, identity('environmentVariables')]],
  [MultiStepCheck, [...CHECK_RULES, identity('environmentVariables')]],
  [PlaywrightCheck, [...CHECK_RULES, identity('environmentVariables')]],
  [AgenticCheck, CHECK_RULES.filter(rule => rule.pointer[0] !== 'shouldFail' && rule.pointer[0] !== 'frequency')],
  [UrlMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES, ...under('request', URL_REQUEST_KEYS)]],
  [TcpMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES]],
  [DnsMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES]],
  [GrpcMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES]],
  [SslMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES]],
  [TracerouteMonitor, [...CHECK_RULES, ...RESPONSE_TIME_RULES]],
  [IcmpMonitor, [...CHECK_RULES, identity('degradedPacketLossThreshold'), identity('maxPacketLossThreshold')]],
  [HeartbeatMonitor, [
    ...CHECK_RULES,
    ...HEARTBEAT_KEYS.map(key => ({ pointer: ['heartbeat', key], target: [key], group: key.startsWith('period') ? 'period' : 'grace' })),
  ]],
  [CheckGroupV1, GROUP_RULES],
  [CheckGroupV2, GROUP_RULES],
])

/** Paths that name another resource or a relation rather than a value of this one. */
const REFERENCE_PREFIXES = ['alertChannels', 'privateLocations', 'alertChannelSubscriptions', 'privateLocationAssignments', 'groupId']

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
    return nodeAt(raw, remaining) === undefined
  }
  return withheld(current.value) || isDeepStrictEqual(nodeAt(raw, remaining), current.value)
}

interface Candidate {
  rule: Rule
  /** Every remote change that named this path; more than one for a set. */
  changes: DiffChange[]
  /** Changes the code made under the same path since the last deploy, which `before` cannot hold. */
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
  if (isShapeChangePath(change.path)) {
    return 'spelled by the CLI, not a construct property'
  }
  if (segments[0] === 'frequencyOffset') {
    return 'a sub-minute schedule; use Frequency.EVERY_*S'
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
    if (rule === undefined) {
      context.skip('not a property this tool can update', change.path)
      continue
    }
    const key = rule.target.join('.')
    const candidate = byPath.get(key) ?? { rule, changes: [], local: [] }
    candidate.changes.push(change)
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
function valueFor (
  context: EntryContext,
  candidate: Candidate,
  before: unknown,
  blanked: unknown,
): { value: unknown } | undefined {
  const { rule } = candidate
  const segments = rule.pointer
  const property = rule.target.join('.')
  if (candidate.local.length > 0) {
    context.skip('your code also changed it since the last deploy; merge by hand', property)
    return undefined
  }
  const raw = nodeAt(before, segments)
  if (!isDeepStrictEqual(raw, nodeAt(blanked, segments))) {
    context.skip('contains a locked or secret value that Checkly does not return', property)
    return undefined
  }
  if (withheld(raw)) {
    context.skip('contains a value Checkly does not return in full', property)
    return undefined
  }
  for (const change of candidate.changes) {
    if (change.origin === 'both' && change.remote === undefined) {
      context.skip('Checkly did not report the value it holds', property)
      return undefined
    }
    const remaining = pointerSegments(change.path).slice(segments.length)
    if (!agrees(change, rule, remaining, raw)) {
      context.skip('Checkly reported two different current values', property)
      return undefined
    }
  }
  if (property === 'frequency') {
    // The construct takes whole minutes as a number; anything else — zero
    // with an offset, or the object spelling — is a helper's job.
    const offsetReported = (context.entry.changes ?? []).some(change => change.path === '/frequencyOffset')
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || offsetReported) {
      context.skip('a sub-minute schedule; use Frequency.EVERY_*S', property)
      return undefined
    }
  }
  return { value: raw }
}

interface FileWork {
  /** The names `checkly/constructs` exports for the construct's class. */
  names: ReadonlySet<string>
  context: EntryContext
  edits: (LiteralEdit & { replacesLocalEdit: boolean, group?: string })[]
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
          path: candidate.rule.target,
          value: found.value,
          replacesLocalEdit: candidate.changes.some(change => change.origin === 'both'),
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
        let result = applyLiteralEdits(source, options, attempt)
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
          result = applyLiteralEdits(source, options, attempt)
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
          const resolution = resolvePath(reparsed, edit.path)
          if (resolution.kind !== 'found' || !isDeepStrictEqual(evaluateLiteral(resolution.node), edit.value)) {
            throw new WriteBackSkipped(`the edited file did not read back as expected at ${edit.path.join('.')}`)
          }
        }
        text = result.text
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
        break
      }
    }
    if (text !== original) {
      files.push({ path: filePath, text, original })
      applied.push(...lines)
    }
  }
  return { files, applied, skipped }
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
