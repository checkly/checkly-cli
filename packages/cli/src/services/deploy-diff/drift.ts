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
import {
  blankRedacted,
  carriesMarker,
  DEPLOY_ONLY_KEYS,
  idKey,
  isMaskedMarker,
  MASK,
  NOT_FILLED,
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
 * left it (`-`) against the construct as Checkly has it now (`+`). The
 * current state comes in the import format, the deployed one in the
 * vocabulary of the deploy payload; the deployed side is converted to the
 * import format where a reported change reaches it and is the current state
 * everywhere else, so that the two sides differ only where something
 * changed. Nothing here reads the loaded project or the process's
 * configuration: whatever the rendering depends on is passed in.
 */

/** Drift is a change made in Checkly; the diff says so once, not per line. */
const NO_ORIGIN: OriginNote = () => ''

/** The note for a change whose deployed text is reported only by its hash, which no store keeps. */
const textUnavailable = (change: DiffChange): string =>
  `${change.path}: changed in Checkly (the deployed text is not available)`

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Keys a reported path or value may never name: writing through them would
 * reach an object's prototype rather than a property of the payload.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** A list index, as a pointer names a list element's position. */
const LIST_INDEX = /^(0|[1-9]\d*)$/

/**
 * Top-level keys the deployed side never renders from the deployed value:
 * the resource's id and the relation rows it carries, and the keys no side
 * renders, all taken from the current payload, and the keys only a deploy
 * reads. A change under one is noted instead.
 */
const NOT_RENDERED_ROOT_KEYS: ReadonlySet<string> = new Set([...NOT_FILLED, ...UNRENDERED_KEYS, ...DEPLOY_ONLY_KEYS])

/**
 * Top-level keys whose deployed value is taken whole wherever a change
 * reaches it, never merged with the current one: the deploy payload and the
 * import format spell the value differently, and the codegen renders either
 * spelling alike. An intent is `{ goal, requiredOutcomes, mustPreserve }` in
 * a deploy and `{ goal, constraints }` in the import format.
 */
const ATOMIC_ROOT_KEYS: ReadonlySet<string> = new Set(['intent'])

/**
 * Resource types whose import format spells a null retry strategy beside
 * the legacy `doubleCheck` flag as the flag's single retry: a change to the
 * flag alone moves the rendered strategy.
 */
const LEGACY_RETRY_TYPES: ReadonlySet<string> = new Set(['check', 'check-group'])

/** Sets the value at `segments` inside `root`, creating objects on the way; `undefined` removes it. */
function setAt (root: Record<string, unknown>, segments: readonly string[], value: unknown): void {
  let node: unknown = root
  for (const segment of segments.slice(0, -1)) {
    const holder = node as Record<string, unknown>
    if (typeof holder[segment] !== 'object' || holder[segment] === null) {
      setOwn(holder, segment, {})
    }
    node = holder[segment]
  }
  const holder = node as Record<string, unknown>
  const last = segments[segments.length - 1]
  if (value === undefined) {
    delete holder[last]
  } else {
    setOwn(holder, last, value)
  }
}

/**
 * A value in the deploy payload's vocabulary decoded into the import
 * format: a masked position as the mask (never null, which a locked
 * variable's codegen refuses under masking), a reference by logical id
 * (`{ $ref }` or `{ ref }`) or by physical id (`{ $id }`) placed the way the
 * import format places one (`substitute`). An unknown reference, one under
 * a key that holds none, or a key that names a prototype throws
 * `UnshapeableError`.
 */
function decode (value: unknown, key: string | undefined, ids: PhysicalIds): unknown {
  const byId = new Map(ids)
  const toRefs = (node: unknown, nodeKey: string | undefined): unknown => {
    if (isMaskedMarker(node)) {
      return MASK
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
        throw new UnshapeableError(`'${nodeKey}' holds an id this rendering does not know how to place`)
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

/** Whether a `{ $hash }` stands anywhere in a value. */
function containsHash (value: unknown): boolean {
  if (isHash(value)) {
    return true
  }
  if (Array.isArray(value)) {
    return value.some(containsHash)
  }
  return isPlainObject(value) && Object.values(value).some(containsHash)
}

/** The elements of a list by their `key`, for each key exactly one element of the list holds. */
function elementsByUniqueKey (list: unknown): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown> | null>()
  for (const element of Array.isArray(list) ? list : []) {
    if (isPlainObject(element) && typeof element.key === 'string') {
      found.set(element.key, found.has(element.key) ? null : element)
    }
  }
  const unique = new Map<string, Record<string, unknown>>()
  for (const [key, element] of found) {
    if (element !== null) {
      unique.set(key, element)
    }
  }
  return unique
}

/** Stands for a value no change reports beside the one being decoded. */
const UNREPORTED: unique symbol = Symbol('unreported')

const childOf = (node: unknown, key: string): unknown =>
  (isPlainObject(node) && Object.hasOwn(node, key) ? node[key] : undefined)

/**
 * A deployed value with each `{ $hash }` field of a key-value list element
 * (a variable, a header) replaced by the same field of the current element:
 * both lists hold exactly one element with that `key`, and the element's
 * other fields are equal, a masked field matching whatever the current side
 * holds there. Such a field kept its value, which the deployed side knows
 * only by its hash. When the value is a change's `before`, the change's
 * `after` must also hold that element with the same hash there, or the
 * field changed. Elements are matched by key, never by position. Any other
 * hash stays.
 */
function withKnownHashes (value: unknown, current: unknown, reported: unknown): unknown {
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      withKnownHashes(child, childOf(current, key), reported === UNREPORTED ? UNREPORTED : childOf(reported, key)),
    ]))
  }
  if (!Array.isArray(value)) {
    return value
  }
  const ours = elementsByUniqueKey(value)
  const theirs = elementsByUniqueKey(current)
  const after = reported === UNREPORTED ? undefined : elementsByUniqueKey(reported)
  return value.map(element => {
    const key = isPlainObject(element) && typeof element.key === 'string' ? element.key : undefined
    const match = key !== undefined && ours.get(key) === element ? theirs.get(key) : undefined
    if (match === undefined || key === undefined || !isPlainObject(element)) {
      return element
    }
    const now = after === undefined ? UNREPORTED : after.get(key)
    const fields = Object.keys(element)
    if (!fields.some(field => isHash(element[field]))) {
      return withKnownHashes(element, match, now)
    }
    const same = fields.every(field => isHash(element[field])
      ? Object.hasOwn(match, field) && (now === UNREPORTED || isDeepStrictEqual(childOf(now, field), element[field]))
      : isMaskedMarker(element[field]) || isDeepStrictEqual(element[field], match[field]))
    return same
      ? Object.fromEntries(fields.map(field =>
          [field, isHash(element[field]) ? structuredClone(match[field]) : element[field]]))
      : element
  })
}

/** What the deployed side holds, and what could not be shown on it. */
export interface RebuiltDeployed {
  /** The resource as its last deploy left it, in the import format. */
  payload: Record<string, unknown>
  /**
   * Changes the deployed side does not show: one under a key no rendering
   * holds (the deploy-only private location list, the relation rows), a
   * reference it cannot resolve, a key that names a prototype. The
   * deployed side keeps the current value there.
   */
  unapplied: DiffChange[]
  /**
   * Changes whose deployed value is known only by its hash, or reaches a
   * value that is: the deployed side keeps the current value there.
   */
  hashed: DiffChange[]
}

/** A reported change with its pointer split. */
interface Reaching {
  change: DiffChange
  segments: string[]
}

/** A position's value on one side, and whether that side holds the position at all. */
interface Slot {
  has: boolean
  value: unknown
}

const ABSENT: unique symbol = Symbol('absent')

const slotOf = (node: unknown, segment: string | number): Slot => {
  if (Array.isArray(node)) {
    const index = Number(segment)
    return index < node.length ? { has: true, value: node[index] } : { has: false, value: undefined }
  }
  return isPlainObject(node) && Object.hasOwn(node, segment)
    ? { has: true, value: node[segment] }
    : { has: false, value: undefined }
}

/** Sets an own property, whatever its name: an assignment to `__proto__` would replace the prototype. */
const setOwn = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

/** Whether `outer` is `inner` or one of its ancestors. */
const isPrefix = (outer: readonly string[], inner: readonly string[]): boolean =>
  outer.length <= inner.length && outer.every((segment, index) => inner[index] === segment)

const isCompound = (value: unknown): boolean => typeof value === 'object' && value !== null && !isHash(value)

/**
 * The resource as its last deploy left it, in the import format.
 *
 * `deployed` is the resource as that deploy left it, in the vocabulary of
 * the deploy payload; `current` the resource now, in the import format;
 * `changes` what changed between them, each `before` the deployed value at
 * its path. The changes decide where the two sides differ: a position no
 * change reaches (the change's path is it, lies under it or above it) takes
 * the current value, so values the comparison skips, a set's order and the
 * two formats' spelling of an unchanged value read alike on both sides.
 * Where a change reaches, the deployed side is decoded into the import
 * format:
 *
 * - A change whose `before` is absent while changes under it carry one is
 *   an object or a set that turned into a leaf (`null`, an empty set): its
 *   position is rebuilt from the deployed value, each change under it
 *   filled from its own `before`.
 * - A position a change names takes that change's `before`, absent when it
 *   has none: a masked value is masked alike in a change's `before` and
 *   `after`, which the deployed value cannot promise.
 * - A set (a change names an element under a key that is not a list index:
 *   the identity digest an element of a set is reported by) takes the
 *   deployed elements, those equal to a current element in the current
 *   order, the rest after them. A list is never reordered.
 * - An intent takes the deployed value whole (`ATOMIC_ROOT_KEYS`).
 * - A position the current resource no longer holds (an object or a list
 *   removed since the deploy, reported by its leaves) is rebuilt from the
 *   deployed value, each change under it filled from its own `before`.
 * - Otherwise objects are merged property by property, and a list by
 *   index, under the same rules.
 *
 * A value that holds a reference the given ids cannot resolve keeps the
 * current value, and the changes reaching it are returned as `unapplied`;
 * one that still holds a `{ $hash }` (see `withKnownHashes`) keeps the
 * current value, and its changes are returned as `hashed`. A change named
 * only by its cause has no value to show.
 */
export function deployedSide (
  type: string,
  deployed: Record<string, unknown>,
  current: Record<string, unknown>,
  changes: readonly DiffChange[],
  ids: PhysicalIds,
): RebuiltDeployed {
  const unapplied = new Set<DiffChange>()
  const hashed = new Set<DiffChange>()
  const active: Reaching[] = []
  for (const change of changes) {
    if (change.cause !== undefined) {
      continue
    }
    let segments: string[]
    try {
      segments = pointerSegments(change.path)
    } catch {
      unapplied.add(change)
      continue
    }
    if (segments.length === 0 || NOT_RENDERED_ROOT_KEYS.has(segments[0])
      || segments.some(segment => FORBIDDEN_KEYS.has(segment))) {
      unapplied.add(change)
    } else if (isHash(change.before)) {
      hashed.add(change)
    } else {
      active.push({ change, segments })
    }
  }

  /** Every change at or under `segments` goes to `into`. */
  const give = (into: Set<DiffChange>, segments: readonly string[], reach: readonly Reaching[]) => {
    for (const { change, segments: path } of reach) {
      if (isPrefix(segments, path)) {
        into.add(change)
      }
    }
  }
  const keep = (now: Slot): unknown => (now.has ? structuredClone(now.value) : ABSENT)

  /**
   * A deployed or reported value decoded at `segments`, or the current one
   * where it cannot be. A list element (its `key` the list's, not its own
   * index) is decoded as the only element of its list: the import format
   * places some elements differently from a lone value under the same key
   * (a status page card's service is `{ id }`, a card always holds its
   * `services`).
   */
  const take = (
    segments: string[],
    key: string,
    raw: unknown,
    now: Slot,
    reach: readonly Reaching[],
    reported: unknown = UNREPORTED,
  ): unknown => {
    if (raw === undefined) {
      return ABSENT
    }
    const element = key !== segments[segments.length - 1]
    const known = element
      ? (withKnownHashes([raw], [now.value], reported === UNREPORTED ? UNREPORTED : [reported]) as unknown[])[0]
      : withKnownHashes(raw, now.value, reported)
    if (containsHash(known)) {
      give(hashed, segments, reach)
      return keep(now)
    }
    try {
      return element ? (decode([known], key, ids) as unknown[])[0] : decode(known, key, ids)
    } catch (cause) {
      if (!(cause instanceof UnshapeableError)) {
        throw cause
      }
      give(unapplied, segments, reach)
      return keep(now)
    }
  }

  /** The deployed elements of a set, those equal to a current element first, in the current order. */
  const ordered = (value: unknown, now: Slot): unknown => {
    if (!Array.isArray(value) || !Array.isArray(now.value)) {
      return value
    }
    const used = new Set<number>()
    const first: unknown[] = []
    for (const element of now.value) {
      const index = value.findIndex((candidate, at) => !used.has(at) && isDeepStrictEqual(candidate, element))
      if (index !== -1) {
        used.add(index)
        first.push(value[index])
      }
    }
    return [...first, ...value.filter((_, at) => !used.has(at))]
  }

  /**
   * Whether a change under the position names an element of a set: by the
   * identity digest the element is reported under, which is any segment
   * that is not a valid index into the position's list on either side. A
   * digest may consist of digits alone.
   */
  const isSetAt = (depth: number, under: readonly Reaching[], lists: readonly unknown[]) =>
    under.some(({ segments }) => {
      const segment = segments[depth]
      return !LIST_INDEX.test(segment)
        || !lists.some(list => Array.isArray(list) && Number(segment) < list.length)
    })

  /**
   * How the changes reaching a position relate to it: the one at its path,
   * those under it, and whether the one at its path is a container (an
   * object or a set that turned into a leaf, its `before` absent while the
   * changes under it carry one).
   */
  const relation = (depth: number, reach: readonly Reaching[]) => {
    const exact = reach.find(({ segments: path }) => path.length === depth)
    const under = reach.filter(({ segments: path }) => path.length > depth)
    const container = exact !== undefined && exact.change.before === undefined
      && under.some(({ change }) => change.before !== undefined)
    return { exact, under, container }
  }

  /**
   * The deployed value at `segments` in the deploy payload's vocabulary,
   * rebuilt from `then` (the deployed value there): each position a change
   * names takes that change's `before`, any other keeps the deployed value.
   */
  const restore = (segments: string[], then: Slot, reach: readonly Reaching[]): unknown => {
    const depth = segments.length
    const { exact, under, container } = relation(depth, reach)
    const at = (segment: string) => under.filter(({ segments: path }) => path[depth] === segment)
    if (exact !== undefined && !container) {
      return exact.change.before
    }
    if (Array.isArray(then.value) && (isSetAt(depth, under, [then.value]) || under.length === 0)) {
      return then.value
    }
    if (Array.isArray(then.value)) {
      return then.value.map((element, index) =>
        restore([...segments, String(index)], { has: true, value: element }, at(String(index))))
    }
    const named = under.filter(({ change }) => change.before !== undefined).map(({ segments: path }) => path[depth])
    if (!isPlainObject(then.value) && named.length === 0) {
      return then.has ? then.value : undefined
    }
    const source = isPlainObject(then.value) ? then.value : {}
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(source), ...named])) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue
      }
      const value = restore([...segments, key], slotOf(source, key), at(key))
      if (value !== undefined) {
        setOwn(result, key, value)
      }
    }
    return result
  }

  /**
   * The deployed value of an atomic key, in the deploy payload's vocabulary:
   * a `{ $hash }` no change reaches is a value that stayed as it was, the
   * current value under the same key, and each change under the key
   * overlays its `before`.
   */
  const atomic = (segments: string[], then: Slot, now: Slot, reach: readonly Reaching[]): unknown => {
    if (!then.has) {
      return undefined
    }
    const depth = segments.length
    const unhashed = (node: unknown, current: unknown, path: string[]): unknown => {
      if (isHash(node)) {
        const reached = reach.some(({ segments: other }) => isPrefix(path, other))
        return reached || current === undefined ? node : structuredClone(current)
      }
      if (isPlainObject(node)) {
        return Object.fromEntries(Object.entries(node).map(([childKey, child]) =>
          [childKey, unhashed(child, childOf(current, childKey), [...path, childKey])]))
      }
      return Array.isArray(node)
        ? node.map((element, index) => unhashed(element, undefined, [...path, String(index)]))
        : node
    }
    const raw = unhashed(then.value, now.value, segments)
    if (!isPlainObject(raw)) {
      return raw
    }
    for (const { change, segments: path } of reach) {
      if (path.length > depth) {
        // A copy: a later, deeper change is written into the value this one sets.
        setAt(raw, path.slice(depth), structuredClone(change.before))
      }
    }
    // A list element removed by an overlay leaves a hole, which a list never holds.
    const compact = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.filter(() => true).map(compact)
      }
      return isPlainObject(node)
        ? Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, compact(child)]))
        : node
    }
    return compact(raw)
  }

  /** The deployed side's value at `segments`, `key` naming the property (a list's, for its elements), or `ABSENT`. */
  const build = (segments: string[], key: string, now: Slot, then: Slot, above: readonly Reaching[]): unknown => {
    const reach = above.filter(({ segments: path }) => isPrefix(path, segments) || isPrefix(segments, path))
    if (reach.length === 0 && segments.length === 1 && implied.has(key)) {
      return then.has ? take(segments, key, then.value, now, reach) : keep(now)
    }
    if (reach.length === 0) {
      return keep(now)
    }
    const depth = segments.length
    const { exact, under, container } = relation(depth, reach)
    const isSet = (Array.isArray(now.value) || Array.isArray(then.value))
      && isSetAt(depth, under, [now.value, then.value])
    // A set's container change, or a set whose elements alone are reported.
    if (isSet && (container || exact === undefined)) {
      return ordered(take(segments, key, then.has ? then.value : undefined, now, reach), now)
    }
    if (container) {
      return take(segments, key, restore(segments, then, reach), now, reach)
    }
    if (exact !== undefined) {
      return take(segments, key, exact.change.before, now, reach, exact.change.after)
    }
    if (depth === 1 && ATOMIC_ROOT_KEYS.has(key)) {
      return take(segments, key, atomic(segments, then, now, reach), now, reach)
    }
    if (!now.has || (!isCompound(now.value) && isCompound(then.value))) {
      return take(segments, key, restore(segments, then, reach), now, reach)
    }
    if (isPlainObject(now.value)) {
      const source = isPlainObject(then.value) ? then.value : {}
      const result = mergeObject(segments, now.value, source, reach)
      // An object the deploy did not leave, whose every property was added since.
      return !then.has && Object.keys(result).length === 0 ? ABSENT : result
    }
    if (Array.isArray(now.value)) {
      const elements = Array.isArray(then.value) ? then.value : now.value
      const result: unknown[] = []
      elements.forEach((_, index) => {
        const segment = String(index)
        const value = build([...segments, segment], key, slotOf(now.value, segment), slotOf(then.value, segment), reach)
        if (value !== ABSENT) {
          result.push(value)
        }
      })
      // A list the deploy did not leave, whose every element was added since.
      return !then.has && result.length === 0 ? ABSENT : result
    }
    // A change under a value that holds no properties: nothing to show it on.
    give(unapplied, segments, reach)
    return keep(now)
  }

  const mergeObject = (
    segments: string[],
    now: Record<string, unknown>,
    then: Record<string, unknown>,
    reach: readonly Reaching[],
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    const depth = segments.length
    const root = depth === 0
    // A property neither side holds may still be named by a change.
    const named = reach.filter(({ segments: path }) => path.length > depth).map(({ segments: path }) => path[depth])
    for (const key of new Set([...Object.keys(now), ...Object.keys(then), ...named])) {
      const fixed = FORBIDDEN_KEYS.has(key) || (root && NOT_RENDERED_ROOT_KEYS.has(key))
      const value = fixed
        ? keep(slotOf(now, key))
        : build([...segments, key], key, slotOf(now, key), slotOf(then, key), reach)
      if (value !== ABSENT) {
        setOwn(result, key, value)
      }
    }
    return result
  }

  // A change to the legacy flag alone reaches the strategy: the deployed
  // strategy is taken, and the flag's single retry spelled after the merge.
  const flagged = LEGACY_RETRY_TYPES.has(type)
    && active.some(({ segments }) => segments.length === 1 && segments[0] === 'doubleCheck')
  const implied: ReadonlySet<string> = new Set(flagged ? ['retryStrategy'] : [])
  const payload = mergeObject([], current, deployed, active)
  // A check or v1 group that retries through the legacy `doubleCheck` flag
  // alone has a null strategy, which the import format spells as the flag's
  // single retry.
  if ((type === 'check' || type === 'check-group') && payload.doubleCheck === true && payload.retryStrategy === null) {
    payload.retryStrategy = { ...SINGLE_RETRY_ELSEWHERE }
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
  const byDepth = (a: DiffChange, b: DiffChange) => depthOf(a) - depthOf(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0)
  const inOrder = (a: DiffChange, b: DiffChange) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
  return {
    payload,
    unapplied: [...unapplied].sort(byDepth),
    hashed: [...hashed].filter(change => !unapplied.has(change)).sort(inOrder),
  }
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
  /**
   * The resource as its last deploy left it, in the vocabulary of the
   * deploy payload (see `deployedSide`).
   */
  deployed: unknown
  /** Physical ids by `idKey(type, logicalId)`, for the references the changes name by logical id. */
  ids: PhysicalIds
  /** See `ContextOptions.projectDefaults`. */
  projectDefaults: ProjectDefaults | undefined
  referencedNames?: ReferencedNames
  /** Lines of context around each change. */
  context?: number
  /** The most lines a diff may take before the listing is printed instead. */
  maxLines?: number
  /** See `BlankOptions.keepEmpty`: only for a payload that never blanks a credential to an empty value. */
  keepEmpty?: boolean
}

/**
 * The lines describing a resource's drift: the construct diff of the
 * deployed and the current state, the text diffs and notes of what the
 * construct cannot show, notes for changes the deployed side cannot show, and
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
  const { entry, deployed: then, ids, projectDefaults, referencedNames, context, maxLines, keepEmpty = false } = input
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
  if (!isPlainObject(then)) {
    throw new UnshapeableError('the resource as deployed is not available')
  }
  const { type, logicalId } = entry
  const current = structuredClone(entry.before)
  for (const key of UNRENDERED_KEYS) {
    delete current[key]
  }
  const rebuilt = deployedSide(type, then, current, changes, ids)
  const hashed = new Set(rebuilt.hashed)
  const deployed: Resource = {
    type: type as ResourceType,
    logicalId,
    payload: blankRedacted(rebuilt.payload, entry.redactions, { keepEmpty }),
  }
  const live: Resource = {
    type: type as ResourceType,
    logicalId,
    payload: blankRedacted(structuredClone(current), entry.redactions, { keepEmpty }),
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
      textAt: change => (hashed.has(change) ? undefined : valueAt(rebuilt.payload, change.path)),
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
