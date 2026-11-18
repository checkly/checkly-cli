import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Resource, ResourceType } from '../../constructs/construct-codegen.js'
import type { ProjectDefaults, ReferencedNames } from '../../constructs/internal/codegen/index.js'
import { SINGLE_RETRY_ELSEWHERE } from '../../constructs/internal/default-retry-strategy.js'
import type { DiffChange, DiffEntry } from '../../rest/projects.js'
import {
  changedByCauseAlone,
  diffSides,
  isHash,
  isOutsideConstruct,
  listing,
  note,
  type OriginNote,
  type RenderedLine,
  ruleReaches,
  valueAt,
} from './construct-diff.js'
import { asStoredRetryStrategy } from './double-check.js'
import {
  blankRedacted,
  carriesMarker,
  idKey,
  isMaskedMarker,
  MASK,
  NUMERIC_ID_TYPES,
  type PhysicalIds,
  pointerSegments,
  REFERENCE_KEYS,
  relationResourcesFromBefore,
  substitute,
  UNRENDERED_KEYS,
  UnshapeableError,
} from './import-shape.js'

/**
 * A resource's drift as a construct diff: the construct as its last deploy
 * left it (`-`) against the construct as Checkly has it now (`+`). Only the
 * current state is stored, in the import format; the deployed state is
 * rebuilt from it by undoing each reported change, whose `before` is the
 * value the deploy left. Nothing here reads the loaded project or the
 * process's configuration: whatever the rendering depends on is passed in.
 */

/** Drift is a change made in Checkly; the diff says so once, not per line. */
const NO_ORIGIN: OriginNote = () => ''

/** The note for a change whose deployed text is reported only by its hash, which no store keeps. */
const textUnavailable = (change: DiffChange): string =>
  `${change.path}: changed in Checkly (the deployed text is not available)`

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isScalar = (value: unknown): boolean =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/**
 * Keys a reported path or value may never name: writing through them would
 * reach an object's prototype rather than a property of the payload.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** A `$hash` inside a compound value: the change cannot be undone without its text. */
class HashedInsideError extends Error {}

/** A list index, as the backend writes a list element's position in a pointer. */
const LIST_INDEX = /^(0|[1-9]\d*)$/

/**
 * The node at `segments`, descending only through own properties (and list
 * positions), or undefined where the path does not resolve.
 */
function ownNodeAt (root: unknown, segments: readonly string[]): unknown {
  let node = root
  for (const segment of segments) {
    if (Array.isArray(node)) {
      node = LIST_INDEX.test(segment) ? node[Number(segment)] : undefined
    } else if (isPlainObject(node) && Object.hasOwn(node, segment)) {
      node = node[segment]
    } else {
      return undefined
    }
  }
  return node
}

/**
 * A reported value decoded into the import format: a masked position as
 * the mask (never null, which a locked variable's codegen refuses under
 * masking), a reference by logical id (`{ $ref }`) or by physical id
 * (`{ $id }`) placed the way the import format places one (`substitute`).
 * An unknown reference, one under a key that holds none, or a key that
 * names a prototype throws `UnshapeableError`; a hash anywhere inside
 * throws `HashedInsideError`.
 */
function decode (value: unknown, key: string | undefined, ids: PhysicalIds): unknown {
  const byId = new Map(ids)
  const toRefs = (node: unknown, nodeKey: string | undefined): unknown => {
    if (isMaskedMarker(node)) {
      return MASK
    }
    if (isHash(node)) {
      throw new HashedInsideError()
    }
    if (Array.isArray(node)) {
      return node.map(element => toRefs(element, nodeKey))
    }
    if (!isPlainObject(node)) {
      return node
    }
    const keys = Object.keys(node)
    const forbidden = keys.find(childKey => FORBIDDEN_KEYS.has(childKey))
    if (forbidden !== undefined) {
      throw new UnshapeableError(`'${nodeKey}' holds the key '${forbidden}'`)
    }
    if (keys.length === 1 && typeof node.$ref === 'string') {
      return { ref: node.$ref }
    }
    if (keys.length === 1 && (typeof node.$id === 'string' || typeof node.$id === 'number')) {
      const type = nodeKey !== undefined && Object.hasOwn(REFERENCE_KEYS, nodeKey) ? REFERENCE_KEYS[nodeKey] : undefined
      if (type === undefined) {
        throw new UnshapeableError(`'${nodeKey}' holds an id this rebuild does not know how to place`)
      }
      const id = NUMERIC_ID_TYPES.has(type) ? Number(node.$id) : String(node.$id)
      if (typeof id === 'number' && !Number.isFinite(id)) {
        throw new UnshapeableError(`'${nodeKey}' holds the id '${node.$id}', which is not a number`)
      }
      // A token no logical id can equal, resolved to the id itself.
      const token = `$id:${node.$id}`
      byId.set(idKey(type, token), id)
      return { ref: token }
    }
    return Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, toRefs(child, childKey)]))
  }
  const refs = toRefs(value, key)
  return substitute(refs, key, byId)
}

/** What could not be undone, and what was undone only in part. */
export interface RebuiltDeployed {
  /** The resource as its last deploy left it, in the import format. */
  payload: Record<string, unknown>
  /**
   * Changes the rebuild did not apply: a path the import format does not
   * hold (other than an object removed since the deploy), a set of objects, a reference it cannot resolve, a hash inside a
   * compound value, a key that names a prototype. The deployed side keeps
   * the current value there.
   */
  unapplied: DiffChange[]
  /** Changes whose deployed value is reported only by its hash; the deployed side keeps the current value. */
  hashed: DiffChange[]
}

/** A change with its pointer split, and where it applies. */
interface Planned {
  change: DiffChange
  segments: string[]
  /** `set` for an element of a set of scalars, `property` for an object's key. */
  kind: 'set' | 'property'
}

/** Whether `inner` lies strictly under `outer`. */
const isUnder = (inner: readonly string[], outer: readonly string[]): boolean =>
  inner.length > outer.length && outer.every((segment, index) => inner[index] === segment)

/**
 * Where a change applies, or undefined when it cannot be applied. A path
 * through a list is applied only as an element of a set of scalars (`tags`,
 * `locations`), whose element key is an identity digest: a set of objects,
 * a path under one of its elements, and the deploy-only `privateLocations`
 * (assignments are rows of their own in the import format) are not guessed
 * at, nor is a path through a key that names a prototype.
 */
function plan (payload: unknown, change: DiffChange): Planned | undefined {
  const segments = pointerSegments(change.path)
  if (segments.length === 0 || segments[0] === 'privateLocations' || segments.some(segment => FORBIDDEN_KEYS.has(segment))) {
    return undefined
  }
  for (let index = 0; index < segments.length - 1; index += 1) {
    const node = ownNodeAt(payload, segments.slice(0, index + 1))
    if (!Array.isArray(node)) {
      continue
    }
    const element = index === segments.length - 2
    return element && node.every(isScalar) ? { change, segments, kind: 'set' } : undefined
  }
  return { change, segments, kind: 'property' }
}

/**
 * How the changes of one rebuild relate. The backend reports a value that
 * turned from an object into a leaf (a retry strategy removed: `null`), or
 * the reverse, as a change at the parent's own path plus one per leaf of
 * the object under it. A parent change whose leaves carry the deployed
 * values (`before`) is a container: the leaves rebuild the object, and the
 * parent change itself is not applied. One whose leaves carry no deployed
 * value is applied, and its deployed value (`null`) already accounts for
 * them.
 */
interface Structure {
  /** Changes neither applied nor unapplied: a container, or a leaf its parent's value covers. */
  covered: Set<DiffChange>
  /** Pointers under which a missing or `null` parent may be created, each with the changes that build it. */
  creatable: Array<{ segments: string[], changes: Planned[] }>
  /** Every change that has a place to apply. */
  planned: readonly Planned[]
}

function structure (planned: readonly Planned[]): Structure {
  const covered = new Set<DiffChange>()
  const creatable: Structure['creatable'] = []
  for (const parent of planned) {
    if (parent.kind !== 'property') {
      continue
    }
    const leaves = planned.filter(other => isUnder(other.segments, parent.segments))
    if (leaves.length === 0) {
      continue
    }
    if (leaves.every(leaf => leaf.change.before === undefined)) {
      for (const leaf of leaves) {
        covered.add(leaf.change)
      }
    } else {
      covered.add(parent.change)
      creatable.push({ segments: parent.segments, changes: leaves })
    }
  }
  return { covered, creatable, planned }
}

/**
 * Whether a parent missing at `segments` may be created for the deployed
 * value, rebuilt whole from the changes under it: every one restores a value
 * the current payload lacks.
 *
 * A `null` node is created only under a reported container (see
 * `Structure`), the change the backend reports beside the leaves of an
 * object that became a leaf: under a list that is `null` now, the next
 * segment is a set element's key, not a property.
 *
 * An absent node, under an object the current payload holds, is an object
 * removed since the deploy, which the backend reports by its leaves alone.
 * It is not one when a change under it passes through a list: the backend
 * walks a list by index (`/projects/0/name`), and keys an element of a set
 * by a prefix of its value's digest (see `isSetElement`). Its leaves are
 * values the backend reports as one, a scalar, an empty object or a
 * marker, and each must decode, so no leaf is left out of the object.
 */
function mayCreate (
  segments: readonly string[],
  absent: boolean,
  { creatable, planned }: Structure,
  ids: PhysicalIds,
): boolean {
  const container = creatable.find(entry => entry.segments.every((segment, index) => segments[index] === segment))
  const under = container?.changes ?? (absent ? planned.filter(other => isUnder(other.segments, segments)) : [])
  return under.length > 0 && under.every(other =>
    other.kind === 'property' && other.change.after === undefined && other.change.before !== undefined
    && !isHash(other.change.before)
    && (container !== undefined || isRemovedLeaf(other, segments.length, ids)))
}

/** Whether a change under an absent node at `depth` restores one leaf of an object removed there. */
function isRemovedLeaf (target: Planned, depth: number, ids: PhysicalIds): boolean {
  const { change, segments } = target
  if (!isLeafValue(change.before) || isSetElement(target)
    || segments.slice(depth).some(segment => LIST_INDEX.test(segment))) {
    return false
  }
  try {
    decode(change.before, segments[segments.length - 1], ids)
    return true
  } catch {
    return false
  }
}

/** The shortest key the backend gives an element of a set (its `SET_IDENTITY_KEY_LENGTH`). */
const SET_KEY_MIN_LENGTH = 6

/** The markers `decode` turns back into the value they stand for. */
const DECODED_MARKERS: ReadonlySet<string> = new Set(['$ref', '$id', '$masked'])

/** A single-key `$ref`, `$id` or `$masked` marker. */
const isDecodedMarker = (value: unknown): boolean => {
  if (!isPlainObject(value)) {
    return false
  }
  const keys = Object.keys(value)
  return keys.length === 1 && DECODED_MARKERS.has(keys[0])
}

/**
 * A value the backend reports as one leaf and `decode` restores: a scalar,
 * an empty object, or a `$ref`, `$id` or `$masked` marker. Other stand-ins,
 * such as an opaque value's `$json`, are not.
 */
const isLeafValue = (value: unknown): boolean =>
  isScalar(value) || isDecodedMarker(value) || (isPlainObject(value) && Object.keys(value).length === 0)

/**
 * Whether a change names an element of a set rather than a property: the
 * backend keys an element by a prefix, at least `SET_KEY_MIN_LENGTH`
 * characters long, of the base64url SHA-256 of its value as canonical JSON,
 * which for a leaf value (`isLeafValue`, the caller's precondition) is its
 * `JSON.stringify`.
 */
function isSetElement ({ change, segments }: Planned): boolean {
  const key = segments[segments.length - 1]
  if (key.length < SET_KEY_MIN_LENGTH) {
    return false
  }
  return createHash('sha256').update(JSON.stringify(change.before)).digest('base64url').startsWith(key)
}

/**
 * Undo one change in place. Returns false, having written nothing, when the
 * change cannot be applied.
 */
function apply (
  payload: Record<string, unknown>,
  target: Planned,
  ids: PhysicalIds,
  shape: Structure,
): boolean {
  const { change, segments } = target
  const key = segments[segments.length - 1]
  if (target.kind === 'set') {
    const set = ownNodeAt(payload, segments.slice(0, -1))
    if (!Array.isArray(set)) {
      return false
    }
    // An element of a list is decoded under the list's key, as `substitute` does.
    const listKey = segments[segments.length - 2]
    const added = change.before === undefined ? undefined : decode(change.before, listKey, ids)
    const removed = change.after === undefined ? undefined : decode(change.after, listKey, ids)
    const index = removed === undefined ? -1 : set.findIndex(element => isDeepStrictEqual(element, removed))
    if (removed !== undefined && index === -1) {
      return false
    }
    if (added !== undefined && !isScalar(added)) {
      return false
    }
    if (index !== -1) {
      set.splice(index, 1)
    }
    if (added !== undefined) {
      set.push(added)
    }
    return true
  }
  const value = change.before === undefined ? undefined : decode(change.before, key, ids)
  // The parents: an own object at every step, or a missing one the deployed
  // value nests under (see `mayCreate`), built aside and attached only once
  // nothing can fail.
  let created: { holder: Record<string, unknown>, segment: string, root: Record<string, unknown> } | undefined
  let parent: Record<string, unknown> = payload
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const absent = !Object.hasOwn(parent, segment)
    const node = created === undefined && !absent ? parent[segment] : undefined
    if (created === undefined && isPlainObject(node)) {
      parent = node
      continue
    }
    if (created === undefined) {
      if (value === undefined || (node !== null && node !== undefined)
        || !mayCreate(segments.slice(0, index + 1), absent, shape, ids)) {
        return false
      }
      const root: Record<string, unknown> = {}
      created = { holder: parent, segment, root }
      parent = root
      continue
    }
    const fresh: Record<string, unknown> = {}
    parent[segment] = fresh
    parent = fresh
  }
  if (!Object.hasOwn(parent, key) && change.after !== undefined) {
    return false
  }
  if (created !== undefined) {
    created.holder[created.segment] = created.root
  }
  if (value === undefined) {
    delete parent[key]
  } else {
    parent[key] = value
  }
  return true
}

/** One rebuild on one view of the current payload. */
function rebuildOn (
  view: Record<string, unknown>,
  changes: readonly DiffChange[],
  ids: PhysicalIds,
): RebuiltDeployed {
  const payload = structuredClone(view)
  const unapplied: DiffChange[] = []
  const hashed: DiffChange[] = []
  const planned: Planned[] = []
  // Decided against the current payload before anything is written.
  for (const change of changes) {
    if (change.cause !== undefined) {
      continue
    }
    let target: Planned | undefined
    try {
      target = plan(payload, change)
    } catch {
      target = undefined
    }
    if (target === undefined) {
      unapplied.push(change)
    } else {
      planned.push(target)
    }
  }
  const shape = structure(planned)
  const ordered = [...planned].sort((a, b) => a.segments.length - b.segments.length)
  for (const target of ordered) {
    const { change } = target
    if (shape.covered.has(change)) {
      continue
    }
    if (isHash(change.before)) {
      hashed.push(change)
      continue
    }
    try {
      if (!apply(payload, target, ids, shape)) {
        unapplied.push(change)
      }
    } catch (cause) {
      if (!(cause instanceof UnshapeableError) && !(cause instanceof HashedInsideError)) {
        throw cause
      }
      unapplied.push(change)
    }
  }
  // Noted shallowest first, in the order the changes were reported within a depth.
  const depthOf = (change: DiffChange) => {
    try {
      return pointerSegments(change.path).length
    } catch {
      return 0
    }
  }
  const order = new Map(changes.map((change, index) => [change, index]))
  unapplied.sort((a, b) => depthOf(a) - depthOf(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0))
  return { payload, unapplied, hashed }
}

/**
 * The resource as its last deploy left it: the current payload with each
 * reported change undone, shallowest first, at the change's path. A change
 * named only by its cause has no value to restore. Where a change cannot be
 * undone, the current value stays and the change is returned for a note.
 */
export function rebuildDeployed (
  type: string,
  live: Record<string, unknown>,
  changes: readonly DiffChange[],
  ids: PhysicalIds,
): RebuiltDeployed {
  const current = structuredClone(live)
  for (const key of UNRENDERED_KEYS) {
    delete current[key]
  }
  // Changes are computed from the stored row, which keeps a null retry
  // strategy where the import format spells the legacy `doubleCheck` retry
  // as a strategy object; a stored strategy of exactly that shape reads the
  // same, so the changes are undone on both views and the one that applies
  // more of them is kept, the stored view on a tie.
  const stored = asStoredRetryStrategy(current) as Record<string, unknown>
  const views = stored === current ? [current] : [stored, current]
  const results = views.map(view => rebuildOn(view, changes, ids))
  const best = results.reduce((kept, result) => (result.unapplied.length < kept.unapplied.length ? result : kept))
  const { payload } = best
  if ((type === 'check' || type === 'check-group') && payload.doubleCheck === true && payload.retryStrategy === null) {
    payload.retryStrategy = { ...SINGLE_RETRY_ELSEWHERE }
  }
  return best
}

/** The dotted path's ancestors and itself; a bracketed element key is one segment, dots and all. */
function withAncestors (path: string): string[] {
  const paths: string[] = []
  let depth = 0
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index]
    depth += char === '[' ? 1 : char === ']' ? -1 : 0
    if (char === '.' && depth === 0) {
      paths.push(path.slice(0, index))
    }
  }
  paths.push(path)
  return paths
}

const keyedElements = (list: unknown): Map<string, Record<string, unknown>> | undefined => {
  if (!Array.isArray(list)) {
    return list === undefined || list === null ? new Map() : undefined
  }
  const elements = new Map<string, Record<string, unknown>>()
  for (const element of list) {
    if (!isPlainObject(element) || typeof element.key !== 'string') {
      return undefined
    }
    elements.set(element.key, element)
  }
  return elements
}

const KEY_VALUE_FLAGS = ['locked', 'secret'] as const

/** Construct paths that the import format holds under another name, per resource type. */
const ALIASES: Readonly<Record<string, (path: string) => string[]>> = {
  'alert-channel': path => [
    ...(path.startsWith('config.') ? [path.slice('config.'.length)] : []),
    ...(path === 'config.template' ? ['payload'] : []),
  ],
  'status-page-component': path => (path.startsWith('configuration.') ? [path.slice('configuration.'.length)] : []),
}

/**
 * The construct properties to spell out on both sides of a drift diff, so
 * that a value moved to or from its default reads as a change of that
 * line, not as a line added or removed (`ContextOptions.spelledOut`).
 * Without the code at hand, every property that differs between the two
 * import-format payloads is taken as spelled out, with its ancestors; a
 * key-value list (variables, headers, query parameters) is matched by key,
 * spelling an element's `locked` and `secret` flags where they differ, or
 * where they are set on an element present on one side only. Both payloads are masked alike, so a secret's
 * value never decides what is spelled.
 */
export function spelledOutFromDifference (type: string, deployed: unknown, live: unknown): Set<string> {
  const spelled = new Set<string>()
  const emit = (path: string) => {
    for (const each of withAncestors(path)) {
      spelled.add(each)
    }
  }
  const join = (path: string, key: string) => (path === '' ? key : `${path}.${key}`)
  const compare = (a: unknown, b: unknown, path: string): void => {
    if (isDeepStrictEqual(a, b)) {
      return
    }
    if (isPlainObject(a) && isPlainObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        compare(a[key], b[key], join(path, key))
      }
      return
    }
    if (path !== '') {
      emit(path)
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      const before = keyedElements(a)
      const after = keyedElements(b)
      if (before === undefined || after === undefined) {
        return
      }
      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const one = before.get(key)
        const other = after.get(key)
        for (const flag of KEY_VALUE_FLAGS) {
          // An absent element or flag is the codegen's default, `false`, so an
          // element on one side only spells a flag only when it is set: a
          // `false` one would print a line its code need not have.
          if ((one?.[flag] ?? false) !== (other?.[flag] ?? false)) {
            emit(`${path}[${key}].${flag}`)
          }
        }
      }
      return
    }
    // An object on one side only: each of its properties differs from nothing.
    if (isPlainObject(a)) {
      compare(a, {}, path)
    } else if (isPlainObject(b)) {
      compare({}, b, path)
    }
  }
  compare(deployed, live, '')
  const alias = ALIASES[type]
  if (alias !== undefined) {
    for (const path of [...spelled]) {
      for (const aliased of alias(path)) {
        spelled.add(aliased)
      }
    }
  }
  return spelled
}

export interface DriftDiffInput {
  /**
   * The resource's drift as a preview entry: `before` is the resource as
   * Checkly has it now (the import format, masked, relation rows on it),
   * every change's `before` the value its last deploy left and `after` the
   * value now, and `redactions` the type's rule table.
   */
  entry: DiffEntry
  /** Physical ids by `idKey(type, logicalId)`, for the references the changes name by logical id. */
  ids: PhysicalIds
  /** See `ContextOptions.projectDefaults`. */
  projectDefaults: ProjectDefaults | undefined
  referencedNames?: ReferencedNames
  /** Lines of context around each change. */
  context?: number
  /** The most lines a diff may take before the listing is printed instead. */
  maxLines?: number
}

/**
 * The lines describing a resource's drift: the construct diff of the
 * deployed and the current state, the text diffs and notes of what the
 * construct cannot show, notes for changes the rebuild could not undo, and
 * a note for each secret change whose mark could not be placed. Never
 * throws: a resource that cannot be rendered is listed change by change,
 * after the reason.
 */
export function renderDriftDiff (input: DriftDiffInput): RenderedLine[] {
  const changes = input.entry.changes ?? []
  const shown = changes.filter(change => change.secret !== true)
  const marked = new Set<DiffChange>()
  const lines: RenderedLine[] = []
  try {
    lines.push(...renderShown(input, shown, marked))
  } catch (cause) {
    const reason = cause instanceof UnshapeableError
      ? cause.message
      : `could not render this resource: ${cause instanceof Error ? cause.message : cause}`
    if (shown.length > 0) {
      lines.push(...listing(shown, NO_ORIGIN, reason))
    }
  }
  for (const change of changes) {
    if (change.secret === true && !marked.has(change)) {
      lines.push(note(`secret changed: ${change.path}`))
    }
  }
  return lines
}

function renderShown (input: DriftDiffInput, shown: readonly DiffChange[], marked: Set<DiffChange>): RenderedLine[] {
  const { entry, ids, projectDefaults, referencedNames, context, maxLines } = input
  const changes = entry.changes ?? []
  const secrets = changes.filter(change => change.secret === true)
  if (shown.length === 0 && secrets.length === 0) {
    return []
  }
  if (changedByCauseAlone(entry)) {
    return [note(`changed: ${[...new Set(shown.map(change => change.cause))].join(', ')}`)]
  }
  // As in the deploy preview: a change that is secret or carries a marker is
  // rendered only when a reported rule reaches its path, since the two
  // sides' blanks come from that table.
  const guarded = changes.filter(change =>
    change.secret === true || carriesMarker(change.before) || carriesMarker(change.after))
  if (!guarded.every(change => (entry.redactions ?? []).some(rule => ruleReaches(rule.path, change.path)))) {
    return listing(shown, NO_ORIGIN)
  }
  if (!isPlainObject(entry.before)) {
    throw new UnshapeableError('the resource has no payload to render')
  }
  const { type, logicalId } = entry
  const current = structuredClone(entry.before)
  for (const key of UNRENDERED_KEYS) {
    delete current[key]
  }
  const rebuilt = rebuildDeployed(type, current, changes, ids)
  const deployed: Resource = {
    type: type as ResourceType,
    logicalId,
    payload: blankRedacted(rebuilt.payload, entry.redactions),
  }
  const live: Resource = {
    type: type as ResourceType,
    logicalId,
    payload: blankRedacted(structuredClone(current), entry.redactions),
  }
  // A hashed value inside the construct is noted on its own; one kept in a
  // file of its own gets the same words from the text diff it would have had.
  const hashedInside = rebuilt.hashed.filter(change => !isOutsideConstruct(type, change.path))
  const set = new Set([...rebuilt.unapplied, ...hashedInside])
  // The current relation rows, on both sides: no change to them is reported.
  const relations = relationResourcesFromBefore(type, current)
  const lines = diffSides({
    type,
    shown: shown.filter(change => !set.has(change)),
    secrets,
    marked,
    before: {
      resource: deployed,
      relations,
      markFrom: change => change.before,
      label: '',
      textAt: change => (isHash(change.before) ? undefined : valueAt(rebuilt.payload, change.path)),
    },
    after: {
      resource: live,
      relations,
      markFrom: change => change.after,
      label: ' (changed)',
      textAt: change => valueAt(current, change.path),
    },
    render: {
      variableNames: undefined,
      spelledOut: spelledOutFromDifference(type, deployed.payload, live.payload),
      projectDefaults,
      referencedNames,
    },
    originNote: NO_ORIGIN,
    maxLines,
    context,
    unavailable: textUnavailable,
  })
  for (const change of hashedInside) {
    lines.push(note(textUnavailable(change)))
  }
  lines.push(...listing(rebuilt.unapplied.filter(change => change.secret !== true), NO_ORIGIN))
  return lines
}
