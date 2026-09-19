import type { Resource, ResourceType } from '../../constructs/construct-codegen.js'
import { type Context, MASKED_VALUE } from '../../constructs/internal/codegen/index.js'
import type { Project } from '../../constructs/project.js'
import type { DiffChange, DiffEntry, DiffMaskedMarker, DiffRedaction, ResourceSync } from '../../rest/projects.js'
import type { Program } from '../../sourcegen/index.js'

/**
 * Shapes the local side of a deploy preview like an import resource — the
 * payload `checkly import` receives per resource and the construct codegens
 * read — so it can be rendered by the same codegen as the deployed side and
 * the two diffed as text.
 *
 * The deployed side needs no shaping: a preview's `before` (`detail: 'full'`)
 * IS the import format, straight from the API. The local side is the payload
 * this CLI synthesized for the deploy, which differs from the import format in
 * exactly the ways `toImportResource` bridges: it has no `id`; it references
 * other resources by logical id (`{ ref }`) where the import format carries
 * physical ids; its relations are separate subscription and assignment
 * resources, which the codegen folds onto the parent by registering them; it
 * keeps a check's intent constraints in the author's order where the stored
 * form groups them; and it carries a few keys only a deploy reads.
 *
 * Nothing here canonicalizes nulls, defaults or ordering beyond that. The
 * local payload is well-formed by construction, and the deployed side comes
 * from the same function the import plan uses, which the codegen was written
 * for. A payload that cannot be shaped throws `UnshapeableError`; the
 * renderer catches it and lists the changes instead.
 */

/** Physical ids keyed by `${type}:${logicalId}`. */
export type PhysicalIds = ReadonlyMap<string, string | number>

export function idKey (type: string, logicalId: string): string {
  return `${type}:${logicalId}`
}

/**
 * The segments of an RFC 6901 pointer, unescaped; the root pointer has none.
 *
 * @throws UnshapeableError for a string that is not a pointer, rather than
 * matching it against nothing.
 */
export function pointerSegments (pointer: string): string[] {
  if (pointer === '') {
    return []
  }
  if (!pointer.startsWith('/')) {
    throw new UnshapeableError(`'${pointer}' is not a JSON Pointer`)
  }
  return pointer.slice(1).split('/').map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

/** A payload this module cannot turn into an import resource; the message says why. */
export class UnshapeableError extends Error {}

/** Types whose physical id is a number; every other type's is a string. */
const NUMERIC_ID_TYPES: ReadonlySet<string> = new Set(['check-group', 'alert-channel', 'alert-channel-subscription'])

/**
 * Above every real numeric id, so a synthetic one can never be mistaken for
 * (or collide with) a resource that exists.
 */
const SYNTHETIC_ID_BASE = 1_000_000_000_000

/**
 * A stable id for a resource that has none yet (it is being created), derived
 * from its identity rather than counted: two shapings of the same project
 * must number the same resource the same way, whatever order they run in.
 * FNV-1a over the key, offset above every real id for numeric types; string
 * ids reuse the logical id, which no UUID can equal.
 */
function syntheticId (type: string, logicalId: string): string | number {
  if (!NUMERIC_ID_TYPES.has(type)) {
    return `synthetic:${logicalId}`
  }
  let hash = 0x811c9dc5
  for (const char of `${type}\0${logicalId}`) {
    hash ^= char.codePointAt(0) as number
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return SYNTHETIC_ID_BASE + hash
}

/**
 * Every resource's physical id, for the rendering: the preview's entries
 * carry the id of everything that exists (including a resource the code only
 * references, whose `fromId` construct sends it), and a resource being created
 * gets a synthetic one so the codegen has something to key its registrations
 * on. Every local resource has an entry afterwards; this is the one place an
 * id is minted.
 */
export function physicalIdsFromPlan (diff: readonly DiffEntry[], local: readonly ResourceSync[]): PhysicalIds {
  const ids = new Map<string, string | number>()
  for (const entry of diff) {
    if (entry.physicalId !== undefined) {
      ids.set(idKey(entry.type, entry.logicalId), entry.physicalId)
    }
  }
  for (const resource of local) {
    const key = idKey(resource.type, resource.logicalId)
    if (!ids.has(key)) {
      ids.set(key, resource.physicalId ?? syntheticId(resource.type, resource.logicalId))
    }
  }
  return ids
}

/**
 * The payload keys that hold a reference (`{ ref: logicalId }` in a deploy
 * payload, a physical id in the import format), and the type they point at.
 * `services` is a list of references on a status page card, and its codegen
 * reads each element's `id`, so it is substituted to `{ id }` objects rather
 * than bare ids.
 */
const REFERENCE_KEYS: Readonly<Record<string, ResourceType>> = {
  alertChannelId: 'alert-channel',
  checkId: 'check',
  componentId: 'status-page-component',
  groupId: 'check-group',
  parentId: 'status-page-component',
  privateLocationId: 'private-location',
  serviceId: 'status-page-service',
  services: 'status-page-service',
  statusPageId: 'status-page',
}

/** Keys only a deploy reads; the import format has no counterpart and the codegen would ignore them. */
const DEPLOY_ONLY_KEYS = ['sourceFile', 'codeBundleSha256', 'privateLocations', 'v'] as const

/**
 * Keys of a deployed row that neither side renders: a setup or teardown
 * snippet reference. The codegen resolves one through snippet files an
 * import registers and a preview has not, a deploy clears it either way, and
 * it is a bookkeeping column the plan never reports — so left in `before`,
 * `fillUnchangedFromBefore` would copy it onto the local side.
 */
export const UNRENDERED_KEYS = ['setupSnippetId', 'tearDownSnippetId'] as const

/** Keys of a deployed row that are not properties of the local payload: its id, and the relation rows it carries. */
const NOT_FILLED: ReadonlySet<string> = new Set(['id', 'alertChannelSubscriptions', 'privateLocationAssignments'])

/** A deployed key whose change the plan reports under the deploy payload's own spelling. */
const REPORTED_AS: Readonly<Record<string, string>> = { '/agenticCheckData': '/agentRuntime' }

const escapeSegment = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1')

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Fills into the shaped local payload every property the deployed row holds
 * that the payload leaves out and the plan does not report as changed. Those
 * are the defaults the deploy's validation fills into an absent property
 * (`activated: true`, a check type's response-time limits, an empty header
 * list), which the row then always carries and the codegen prints: the plan
 * compared the validated payload against the row, so a property absent here
 * and unreported there is one the deploy leaves as it is. Taking it from
 * `before` makes the two renderings agree on it without this CLI keeping a
 * copy of any default — and cannot hide a change, since a value copied to
 * both sides prints alike on both.
 *
 * A key is left alone when a reported change path is it, lies under it, or
 * lies above it; an explicit `null` is a value, not an absence; and only
 * object keys are filled, never the elements of a list.
 */
export function fillUnchangedFromBefore (
  local: Record<string, unknown>,
  before: Record<string, unknown>,
  changes: readonly DiffChange[],
): void {
  const reported = changes.map(change => change.path)
  const touched = (pointer: string) =>
    reported.some(path => path === pointer || path.startsWith(`${pointer}/`) || pointer.startsWith(`${path}/`))
  const fill = (target: Record<string, unknown>, source: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(source)) {
      if (prefix === '' && NOT_FILLED.has(key)) {
        continue
      }
      const pointer = `${prefix}/${escapeSegment(key)}`
      const current = target[key]
      if (current === undefined) {
        if (!touched(REPORTED_AS[pointer] ?? pointer)) {
          target[key] = structuredClone(value)
        }
      } else if (isPlainObject(current) && isPlainObject(value)) {
        fill(current, value, pointer)
      }
    }
  }
  fill(local, before, '')
}

function isRef (value: unknown): value is { ref: string } {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 1
    && typeof (value as { ref?: unknown }).ref === 'string'
  )
}

function resolveRef (ids: PhysicalIds, key: string, ref: { ref: string }): string | number {
  const id = ids.get(idKey(REFERENCE_KEYS[key], ref.ref))
  if (id === undefined) {
    throw new UnshapeableError(`'${key}' refers to ${REFERENCE_KEYS[key]} '${ref.ref}', which this plan does not know`)
  }
  return id
}

/**
 * Rebuild a payload subtree with references substituted. Only a JSON-shaped
 * value is accepted: the codegen renders values, and an invalid `Date` or a
 * function would either throw mid-render or print nonsense. A value that
 * serializes itself (`toJSON`) is taken as what it serializes to, which is
 * what the deploy sends.
 */
function substitute (value: unknown, key: string | undefined, ids: PhysicalIds): unknown {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new UnshapeableError(`'${key}' holds an invalid date`)
    }
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    if (key === 'services') {
      return value.map(element =>
        isRef(element) ? { id: resolveRef(ids, key, element) } : substitute(element, key, ids),
      )
    }
    if (key === 'cards') {
      // A card's `services` may be left out (or left undefined) by the
      // construct; the import format always carries the list and the card
      // codegen iterates it unguarded.
      return value.map(element => {
        const card = substitute(element, key, ids)
        return card !== null && typeof card === 'object' && !Array.isArray(card) && !('services' in card)
          ? { ...card, services: [] }
          : card
      })
    }
    return value.map(element => substitute(element, key, ids))
  }
  if (typeof value !== 'object') {
    throw new UnshapeableError(`'${key}' holds a ${typeof value}`)
  }
  if (isRef(value) && key !== undefined && key in REFERENCE_KEYS) {
    return resolveRef(ids, key, value)
  }
  if (isRef(value)) {
    throw new UnshapeableError(`'${key}' holds a reference this shaping does not know how to place`)
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return substitute((value as { toJSON: () => unknown }).toJSON(), key, ids)
  }
  const result: Record<string, unknown> = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (child !== undefined) {
      result[childKey] = substitute(child, childKey, ids)
    }
  }
  return result
}

/**
 * A check's intent as the backend stores and the import format returns it:
 * the constraints grouped by type, required outcomes first, in the order the
 * author gave within each group. The construct keeps the author's
 * interleaving, which the store does not.
 */
function groupConstraints (intent: unknown): unknown {
  if (intent === null || typeof intent !== 'object' || !Array.isArray((intent as { constraints?: unknown }).constraints)) {
    return intent
  }
  const { constraints, ...rest } = intent as { constraints: Array<{ type?: unknown }> }
  const required: unknown[] = []
  const preserved: unknown[] = []
  // A type this CLI does not know keeps its place after the known groups
  // rather than vanishing from the rendering.
  const others: unknown[] = []
  for (const constraint of constraints) {
    const bucket = constraint?.type === 'REQUIRED_OUTCOME' ? required : constraint?.type === 'MUST_PRESERVE' ? preserved : others
    bucket.push(constraint)
  }
  return { ...rest, constraints: [...required, ...preserved, ...others] }
}

/**
 * The local payload of one resource, as an import resource: `id` set, every
 * reference a physical id, deploy-only keys dropped, the intent's constraints
 * grouped as stored, and the agentic runtime under the name the codegen reads
 * (`agenticCheckData`, which is how the backend stores what the deploy
 * payload calls `agentRuntime`). No canonicalization of nulls, defaults or
 * ordering: the payload has none, and the defaults the deploy would fill
 * are taken from the deployed row by `fillUnchangedFromBefore`.
 *
 * @throws UnshapeableError for a payload the codegen could not render.
 */
export function toImportResource (
  type: ResourceType,
  logicalId: string,
  payload: unknown,
  ids: PhysicalIds,
): Resource {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new UnshapeableError('the payload is not an object')
  }
  const id = ids.get(idKey(type, logicalId))
  if (id === undefined) {
    throw new UnshapeableError(`${type} '${logicalId}' has no id in this plan`)
  }
  const shaped = substitute(payload, undefined, ids) as Record<string, unknown>
  for (const key of DEPLOY_ONLY_KEYS) {
    delete shaped[key]
  }
  if ('intent' in shaped) {
    shaped.intent = groupConstraints(shaped.intent)
  }
  if ('agentRuntime' in shaped) {
    const runtime = shaped.agentRuntime as { skills?: unknown } | null | undefined
    shaped.agenticCheckData = runtime && typeof runtime === 'object' ? { skills: runtime.skills ?? null } : null
    delete shaped.agentRuntime
  }
  shaped.id = id
  return { type, logicalId, payload: shaped }
}

interface RelationKinds {
  parentKey: 'checkId' | 'groupId'
  subscription: ResourceType
  assignment: ResourceType
}

/** The relation types a parent of each kind carries, and the parent key on their rows. */
const RELATIONS: Readonly<Record<string, RelationKinds>> = {
  'check': {
    parentKey: 'checkId',
    subscription: 'alert-channel-subscription',
    assignment: 'private-location-check-assignment',
  },
  'check-group': {
    parentKey: 'groupId',
    subscription: 'alert-channel-subscription',
    assignment: 'private-location-group-assignment',
  },
}

interface RelationRow {
  id?: string | number
  alertChannelId?: string | number
  privateLocationId?: string | number
  checkId?: string | number
  groupId?: string | number
  activated?: boolean
}

/** The target a relation row or resource points at, for matching the two sides. */
function relationTarget (payload: RelationRow): string {
  return payload.alertChannelId !== undefined
    ? `alert-channel:${payload.alertChannelId}`
    : `private-location:${payload.privateLocationId}`
}

/**
 * Relations in one stable order, by target, on whichever side they come
 * from: the codegen folds them into `alertChannels`/`privateLocations` in
 * registration order, and the deployed rows' order (creation order) means
 * nothing the diff should show.
 */
function inTargetOrder (resources: Resource[]): Resource[] {
  return [...resources].sort((a, b) =>
    relationTarget(a.payload as RelationRow).localeCompare(relationTarget(b.payload as RelationRow)),
  )
}

/**
 * The relation rows a parent's `before` carries — every live subscription
 * and assignment, the way the import format spells them — as the resources
 * whose `prepare()` registers them on the codegen context.
 */
export function relationResourcesFromBefore (type: string, before: Record<string, unknown>): Resource[] {
  const kinds = RELATIONS[type]
  if (!kinds) {
    return []
  }
  const rows = (key: string): RelationRow[] => (Array.isArray(before[key]) ? (before[key] as RelationRow[]) : [])
  return inTargetOrder([
    ...rows('alertChannelSubscriptions').map(row => ({
      type: kinds.subscription,
      logicalId: `deployed:${kinds.subscription}:${row.id}`,
      payload: row,
    })),
    ...rows('privateLocationAssignments').map(row => ({
      type: kinds.assignment,
      logicalId: `deployed:${kinds.assignment}:${row.id}`,
      payload: row,
    })),
  ])
}

export interface AfterRelationsInput {
  ids: PhysicalIds
  /** Every resource of the local deploy payload. */
  local: readonly ResourceSync[]
  /** The parent's own preview entry: its type, logical id and `before`. */
  entry: DiffEntry
  /** The whole preview, for the relation entries folded into this parent. */
  diff: readonly DiffEntry[]
  pruneRelations: boolean
}

/**
 * The relation resources the local side renders with: the project's own
 * subscription and assignment constructs for this parent, plus every deployed
 * relation the deploy will leave in place. A deployed row is left out when the
 * code removed it (a DELETE or DETACH relation entry folded into this parent
 * names its row id), when `--prune-relations` will delete it (a pruned entry
 * names it too), or when a local construct already stands for the same target.
 * What remains is unmanaged: the deploy keeps it, so both sides show it.
 *
 * @throws UnshapeableError when one of the parent's own relations cannot be shaped.
 */
export function relationResourcesForAfter (input: AfterRelationsInput): Resource[] {
  const { ids, local, entry, diff, pruneRelations } = input
  const { type, logicalId } = entry
  const kinds = RELATIONS[type]
  if (!kinds) {
    return []
  }
  const ownRelations: Resource[] = []
  for (const resource of local) {
    if (resource.type !== kinds.subscription && resource.type !== kinds.assignment) {
      continue
    }
    const parentRef = (resource.payload as Record<string, unknown> | null)?.[kinds.parentKey]
    if (!isRef(parentRef) || parentRef.ref !== logicalId) {
      continue
    }
    ownRelations.push(toImportResource(resource.type as ResourceType, resource.logicalId, resource.payload, ids))
  }

  // Subscriptions and assignments live in different tables, with independent
  // ids, so a removed row is known by its type as well.
  const removed = new Set<string>()
  for (const candidate of diff) {
    const folded = candidate.foldedInto?.type === type && candidate.foldedInto.logicalId === logicalId
    if (!folded) {
      continue
    }
    const goes = candidate.action === 'DELETE' || candidate.action === 'DETACH'
    if (!goes || (candidate.origin === 'unmanaged' && !pruneRelations)) {
      continue
    }
    if (candidate.physicalId === undefined) {
      throw new UnshapeableError(`the plan removes a ${candidate.type} of '${logicalId}' without saying which`)
    }
    removed.add(`${candidate.type}:${candidate.physicalId}`)
  }

  const covered = new Set(ownRelations.map(resource => relationTarget(resource.payload as RelationRow)))
  const kept = entry.before === undefined
    ? []
    : relationResourcesFromBefore(type, entry.before).filter(resource => {
        const row = resource.payload as RelationRow
        return !removed.has(`${resource.type}:${row.id}`) && !covered.has(relationTarget(row))
      })
  return inTargetOrder([...ownRelations, ...kept])
}

const CONDITIONS: Record<NonNullable<DiffRedaction['when']>, (element: Record<string, unknown>) => boolean> = {
  locked: element => element.locked === true,
  lockedOrSecret: element => element.locked === true || element.secret === true,
}

/** What a redacted value renders as, on both sides: never an empty string, which could pass for a value. */
export const MASK = MASKED_VALUE

const placeholderOf = (rule: DiffRedaction) => (rule.kind === 'object' ? null : MASK)

/**
 * Whether a conditional rule applies to the element holding the value. A
 * condition this CLI does not know (a newer API) applies regardless — the
 * one direction that cannot print a credential.
 */
function qualifies (rule: DiffRedaction, element: unknown): boolean {
  if (rule.when === undefined) {
    return true
  }
  const condition = Object.hasOwn(CONDITIONS, rule.when) ? CONDITIONS[rule.when] : undefined
  return condition === undefined || (element !== null && typeof element === 'object' && condition(element as Record<string, unknown>))
}

function blank (node: unknown, segments: readonly string[], rule: DiffRedaction): unknown {
  if (segments.length === 0) {
    return node
  }
  const [segment, ...rest] = segments
  if (segment === '*') {
    // Every position: of a list, or of a map (a free-form header object).
    // A trailing `*` names the positions themselves, each blanked when it
    // qualifies.
    const each = (element: unknown) =>
      (rest.length === 0 ? (qualifies(rule, element) ? placeholderOf(rule) : element) : blank(element, rest, rule))
    if (Array.isArray(node)) {
      return node.map(each)
    }
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, each(v)]))
    }
    return node
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return node
  }
  const object = node as Record<string, unknown>
  const key = segment
  if (rest.length > 0) {
    const replaced = blank(object[key], rest, rule)
    return replaced === object[key] ? node : { ...object, [key]: replaced }
  }
  if (rule.when === undefined) {
    // Unconditional: blank a value that is there.
    if (!(key in object) || object[key] === undefined) {
      return node
    }
  } else if (!qualifies(rule, object)) {
    // Conditional: the element's own flags decide, and the API blanks a
    // qualifying element whether or not the value is there, so this side
    // does too.
    return node
  }
  // The placeholder the rule names, which is what the API wrote on its side.
  return { ...object, [key]: placeholderOf(rule) }
}

/**
 * A payload with the API's redaction rules applied — the type's whole table,
 * whatever the deployed row held — so a credential is masked on both sides
 * (the deployed side arrives blanked and is masked the same way, since a
 * blank could pass for a value) and never a phantom change, nor printed. A
 * rule that matches nothing is simply ignored. No table at all is refused:
 * an API that reports a `before` without one predates the rules, and the one
 * direction this module must never take is printing a credential.
 *
 * @throws UnshapeableError when the API reported no rule table.
 */
export function blankRedacted<T> (payload: T, redactions: readonly DiffRedaction[] | undefined): T {
  if (redactions === undefined) {
    throw new UnshapeableError('the preview reports no redaction rules for this resource')
  }
  let result: unknown = payload
  for (const rule of redactions) {
    result = blank(result, pointerSegments(rule.path), rule)
  }
  return result as T
}

export function isMaskedMarker (value: unknown): value is DiffMaskedMarker {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
    && ((value as DiffMaskedMarker).$masked === 'same' || (value as DiffMaskedMarker).$masked === 'changed')
  )
}

/** Every marker inside a reported value, with its segment path and whether it says `changed`. */
interface MarkerPosition {
  segments: string[]
  changed: boolean
}

function markerPositions (value: unknown, segments: readonly string[] = []): MarkerPosition[] {
  if (isMaskedMarker(value)) {
    return [{ segments: [...segments], changed: value.$masked === 'changed' }]
  }
  if (Array.isArray(value)) {
    return value.flatMap((element, index) => markerPositions(element, [...segments, String(index)]))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, member]) => markerPositions(member, [...segments, key]))
  }
  return []
}

/** Whether a reported value holds a marker anywhere inside it. */
export const carriesMarker = (value: unknown): boolean => markerPositions(value).length > 0

const changedPositions = (value: unknown): string[][] =>
  markerPositions(value).filter(position => position.changed).map(position => position.segments)

/** The value at `segments` inside `root`, or undefined where the path does not resolve. */
export function nodeAt (root: unknown, segments: readonly string[]): unknown {
  let node = root
  for (const segment of segments) {
    if (Array.isArray(node)) {
      node = node[Number(segment)]
    } else if (node !== null && typeof node === 'object') {
      node = (node as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return node
}

/**
 * Overwrite the masked value at `segments` with `label`. Only a masked string
 * is overwritten: a position the rules blank to `null` (a Playwright config
 * subtree) has nothing to print, and one that is not masked at all is not
 * this CLI's to touch.
 */
function label (root: unknown, segments: readonly string[], text: string): boolean {
  const parent = nodeAt(root, segments.slice(0, -1))
  const last = segments[segments.length - 1]
  if (last === undefined || parent === null || typeof parent !== 'object') {
    return false
  }
  const container = parent as Record<string, unknown>
  if (container[last] !== MASK) {
    return false
  }
  container[last] = text
  return true
}

const keyOf = (element: unknown): string | undefined => {
  const key = (element as { key?: unknown } | null)?.key
  return typeof key === 'string' ? key : undefined
}

/**
 * Write `text` over the masked value of every element the report marks
 * `changed`, in the payload's list at `path`. A reported element is matched
 * to the payload's by `key` when that key is unique in both, else by index
 * when the key at that index is the same and the lists are equal in length,
 * else not at all — the deployed row's list can be ordered differently from
 * the report, so an index alone is never trusted, and a name is never
 * wrong. A scalar marker names its own path. Returns whether any mark was
 * placed.
 */
export function markChanged (payload: unknown, path: string, reported: unknown, text: string): boolean {
  const segments = pointerSegments(path)
  const root = nodeAt(payload, segments)
  let placed = false
  if (Array.isArray(reported) && Array.isArray(root)) {
    const count = (list: unknown[], key: string) => list.filter(element => keyOf(element) === key).length
    reported.forEach((element, index) => {
      const positions = changedPositions(element)
      if (positions.length === 0) {
        return
      }
      const key = keyOf(element)
      let target: number | undefined
      if (key !== undefined && count(reported, key) === 1 && count(root, key) === 1) {
        target = root.findIndex(candidate => keyOf(candidate) === key)
      } else if (reported.length === root.length && keyOf(root[index]) === key) {
        target = index
      }
      if (target === undefined) {
        return
      }
      for (const position of positions) {
        placed = label(payload, [...segments, String(target), ...position], text) || placed
      }
    })
    return placed
  }
  for (const position of changedPositions(reported)) {
    placed = label(payload, [...segments, ...position], text) || placed
  }
  return placed
}

type Registrar = (context: Context, id: string | number, name: string, file: ReturnType<Program['generatedSupportFile']>) => void

/** How each referenceable type registers on the codegen context. */
const REGISTRARS: ReadonlyArray<{ type: keyof Project['data'], register: Registrar }> = [
  { type: 'check-group', register: (context, id, name, file) => context.registerCheckGroup(id as number, name, file) },
  { type: 'alert-channel', register: (context, id, name, file) => context.registerAlertChannel(id as number, name, file) },
  { type: 'private-location', register: (context, id, name, file) => context.registerPrivateLocation(id as string, name, file) },
  { type: 'status-page', register: (context, id, name, file) => context.registerStatusPage(id as string, name, file) },
  { type: 'status-page-service', register: (context, id, name, file) => context.registerStatusPageService(id as string, name, file) },
  { type: 'status-page-component', register: (context, id, name, file) => context.registerStatusPageComponent(id as string, name, file) },
]

type Lookup = (context: Context, id: string | number) => { file: ReturnType<Program['generatedConstructFile']> }

const LOOKUPS: Readonly<Record<string, Lookup>> = {
  'check-group': (context, id) => context.lookupCheckGroup(id as number),
  'alert-channel': (context, id) => context.lookupAlertChannel(id as number),
  'private-location': (context, id) => context.lookupPrivateLocation(id as string),
  'status-page': (context, id) => context.lookupStatusPage(id as string),
  'status-page-service': (context, id) => context.lookupStatusPageService(id as string),
  'status-page-component': (context, id) => context.lookupStatusPageComponent(id as string),
}

/**
 * Re-register the construct a codegen has just prepared under its logical
 * id, in the construct file the codegen chose. A codegen names the variable
 * it exports after the resource's content (an alert channel after its
 * address, a group after its name), so a change to that content would show
 * as a renamed variable beside the change itself; the logical id is the
 * same on both sides. A type whose codegen registers no variable is left
 * alone.
 */
export function registerUnderLogicalId (context: Context, resource: Resource): void {
  const lookup = LOOKUPS[resource.type]
  const registrar = REGISTRARS.find(entry => entry.type === resource.type)
  if (lookup === undefined || registrar === undefined) {
    return
  }
  const id = (resource.payload as { id: string | number }).id
  const { file } = lookup(context, id)
  registrar.register(context, id, resource.logicalId, file)
}

/**
 * Register every referenceable construct of the local project on a fresh
 * context, under its physical id, so a rendered reference comes out as the
 * variable name the construct would have rather than as `fromId(...)`. Both
 * sides of a comparison register the same set in the same order, which is
 * what makes their identifiers agree. One support file for all of them, so
 * the context's per-file identifier namespace tells two constructs with the
 * same name apart (`group`, `group2`); a support file, not a construct file,
 * because `renderConstruct` counts the construct files a render adds.
 */
export function registerProject (context: Context, program: Program, project: Project, ids: PhysicalIds): void {
  const file = program.generatedSupportFile('__preview__/project')
  for (const { type, register } of REGISTRARS) {
    const constructs = project.data[type] as Record<string, { name?: unknown, member?: boolean }>
    for (const logicalId of Object.keys(constructs).sort()) {
      const id = ids.get(idKey(type, logicalId))
      // A reference construct (`fromId(...)`) has no name of its own: left
      // unregistered, the codegen renders the reference as the `fromId(...)`
      // it is, on both sides.
      if (id === undefined || constructs[logicalId].member === false) {
        continue
      }
      const name = constructs[logicalId].name
      register(context, id, typeof name === 'string' && name.length > 0 ? name : logicalId, file)
    }
  }
}
