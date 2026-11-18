import type { ProjectDefaults, ReferencedNames, ReferencedResourceType } from '../constructs/internal/codegen/index.js'
import type { DiffChange, DiffEntry } from '../rest/projects.js'
import type { RenderedLine } from '../services/deploy-diff/construct-diff.js'
import type { DiffLine } from '../services/deploy-diff/diff-lines.js'
import { renderDriftDiff } from '../services/deploy-diff/drift.js'
import { idKey } from '../services/deploy-diff/import-shape.js'
import type { GenerateResource } from './generate.js'

/**
 * One property of the resource that changed since its last deploy, as a
 * deploy plan reports it.
 */
export interface GenerateDiffChange {
  /** An RFC 6901 pointer into the resource as the CLI sends it in a deploy. */
  path: string
  /**
   * The value the last deploy left; absent when the property did not exist.
   * A sensitive position is a `{ $masked: 'same' | 'changed' }` marker, a
   * long text or an aggregate a `{ $hash }`, a reference a `{ $ref: logicalId }`
   * or `{ $id: physicalId }`.
   */
  before?: unknown
  /** The value now, spelled like `before`; absent when the property no longer exists. */
  after?: unknown
  /** The reason for a change with no property behind it, such as a new code bundle. */
  cause?: string
  /** Set when a sensitive value moved. */
  secret?: true
  /** Accepted for compatibility with a deploy plan's changes; every change is taken as made in Checkly. */
  origin?: string
}

/** One rule of the resource type's redaction table, as a deploy plan reports it. */
export interface GenerateDiffRedaction {
  /** A JSON Pointer pattern into the resource, `*` standing for every list position. */
  path: string
  /** What the rule blanks to: a `value` is masked, an `object` becomes null. */
  kind: 'value' | 'object'
  /** The flag of the holding element that decides whether the rule applies. */
  when?: 'locked' | 'lockedOrSecret'
}

/** A resource a change or the deployed resource refers to by logical id. */
export interface GenerateDiffReference {
  /** A referenceable resource type, such as `check-group`. */
  type: string
  logicalId: string
  physicalId: string | number
  /** The resource's name, shown in a comment beside its `fromId()` reference. */
  name?: string
}

export interface GenerateDiffInput {
  /**
   * The resource as Checkly has it now, as an import plan carries it:
   * credentials masked, a check's or group's alert channel subscriptions
   * and private location assignments as rows on the payload.
   */
  resource: GenerateResource
  /**
   * The resource as its last deploy left it, in the vocabulary of the
   * deploy payload (the pointers of `changes` address it): a reference as
   * `{ ref: logicalId }`, `{ $ref: logicalId }` or `{ $id: physicalId }`,
   * any value known only by its hash as `{ $hash }`, a set's elements in
   * any order. Every position that is sensitive at the deploy or now is
   * `{ $masked: 'same' }`, never a value or a hash: an element of a list
   * (a variable, a header) is judged by its flags on either side, so a
   * variable locked since the deploy is masked too. Where no change reaches,
   * the deployed side shows the current value whatever this holds; where
   * one does, this supplies what the change alone cannot, such as an object
   * removed since the deploy.
   */
  deployed: Record<string, unknown>
  /** What changed since the last deploy: the authority on where the two sides differ. */
  changes: GenerateDiffChange[]
  /** The resource type's whole redaction table, applied to both sides. */
  redactions: GenerateDiffRedaction[]
  /**
   * Every resource the changes or `deployed` refer to by logical id. A
   * changed set is shown from its deployed elements, unchanged ones
   * included, so their references must resolve too; a set whose deployed
   * elements hold a reference not given here is noted rather than shown.
   */
  references?: GenerateDiffReference[]
}

export interface GenerateDiffOptions {
  /**
   * The check defaults of the project the code lives in. Absent, the
   * project's defaults are unknown and every property is written out, as
   * `generateConstructFiles` does, so both sides read like the code it
   * generates for the resource. Pass `{}` for a project without defaults.
   */
  projectDefaults?: ProjectDefaults
  /**
   * Names of the resources the code refers to by ID, keyed by resource type
   * and physical ID, shown in a comment beside each `fromId()` reference.
   * A name given here wins over a reference's `name`.
   */
  referencedNames?: ReferencedNames
  /**
   * Lines of context around each change, in the construct diff and in the
   * text diff of a script. Defaults to 3; `Infinity` shows the whole construct.
   */
  context?: number
  /** The most lines either side may take before the changes are listed instead. Defaults to 1500. */
  maxLines?: number
}

/**
 * One line of the result. A `DiffLine` (`context`, `add`, `remove`, `hunk`)
 * is a line of the construct diff, a `hunk` starting each changed region; a
 * `note` states a fact in words (a change the diff cannot show, a secret
 * that moved, a listed change); a `reason` says why the listing stands in
 * for the diff; a `nested` line belongs to the text diff of a script or
 * other text kept in a file of its own, printed under its `note`.
 */
export type GenerateDiffLine = RenderedLine

/** A line of a text diff, as a `GenerateDiffLine` or inside a `nested` one. */
export type GenerateDiffTextLine = DiffLine

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const pathOf = (change: unknown): string | undefined => {
  const path = (change as { path?: unknown } | null)?.path
  return typeof path === 'string' ? path : undefined
}

/** Only the documented fields of a change, every one taken as made in Checkly. */
function changeOf (change: GenerateDiffChange): DiffChange {
  const picked: DiffChange = { path: change.path, origin: 'remote' }
  if (change.before !== undefined) {
    picked.before = change.before
  }
  if (change.after !== undefined) {
    picked.after = change.after
  }
  if (typeof change.cause === 'string') {
    picked.cause = change.cause
  }
  if (change.secret === true) {
    picked.secret = true
  }
  return picked
}

function redactionOf (rule: GenerateDiffRedaction): GenerateDiffRedaction {
  const { path, kind, when } = rule
  return when === undefined ? { path, kind } : { path, kind, when }
}

/**
 * Renders a resource's drift — what changed in Checkly since its last
 * deploy — as a diff of its `checkly/constructs` code: the construct as the
 * deploy left it (`remove` lines) against the construct as Checkly has it
 * now (`add` lines), generated by the same codegen as `generateConstructFiles`
 * and compared line by line. Nothing is read from or written to disk, and
 * the result depends on the arguments alone.
 *
 * The result is empty when nothing changed. Otherwise the construct diff
 * comes first, each region opening with a `hunk` line (a consumer printing
 * one diff per resource can drop the first), then the text diffs of
 * scripts and the notes for what the construct cannot show: a change named
 * only by its cause, a text whose deployed version is reported only by its
 * hash, a change the deployed side cannot show, a secret whose movement it
 * cannot mark inline. A secret is never printed: both sides are masked by
 * `redactions`, and a secret that moved reads `(changed)` beside the mask
 * on the current side. A resource that cannot be rendered at all, or comes
 * without a `deployed` object, is listed change by change after a `reason`;
 * this function does not throw for it.
 *
 * @experimental See the `checkly/codegen` entry: intended for Checkly's own
 * services, and not covered by semver guarantees until stated otherwise.
 */
export function generateConstructDiff (
  input: GenerateDiffInput,
  options: GenerateDiffOptions = {},
): GenerateDiffLine[] {
  // Only the fields the entry documents are passed on, whatever a caller
  // from plain JavaScript hands in.
  const { resource, deployed, changes, redactions, references = [] } = input
  const { projectDefaults, referencedNames, context, maxLines } = options
  const valid = Array.isArray(changes) ? changes.filter(change => pathOf(change) !== undefined) : []
  if (valid.length === 0) {
    return []
  }
  const ids = new Map<string, string | number>()
  const names = new Map<string, Record<string, string>>()
  const addNames = (type: string, byId: Record<string, string>) =>
    names.set(type, { ...names.get(type), ...byId })
  for (const reference of Array.isArray(references) ? references.filter(isObject) : []) {
    const { type, logicalId, physicalId, name } = reference
    if (typeof type !== 'string' || typeof logicalId !== 'string'
      || (typeof physicalId !== 'string' && typeof physicalId !== 'number')) {
      continue
    }
    ids.set(idKey(type, logicalId), physicalId)
    if (typeof name === 'string') {
      addNames(type, { [String(physicalId)]: name })
    }
  }
  for (const [type, byId] of Object.entries(isObject(referencedNames) ? referencedNames : {})) {
    if (isObject(byId)) {
      addNames(type, byId as Record<string, string>)
    }
  }
  const ownId = resource?.physicalId ?? resource?.payload?.id
  if (ownId !== undefined && ownId !== null && typeof resource?.type === 'string') {
    ids.set(idKey(resource.type, resource.logicalId), ownId)
  }
  const picked = valid.map(changeOf)
  const entry: DiffEntry = {
    type: String(resource?.type),
    logicalId: String(resource?.logicalId),
    action: 'UPDATE',
    changes: picked,
    before: resource?.payload,
    redactions: Array.isArray(redactions) ? redactions.filter(isObject).map(redactionOf) : undefined,
  }
  try {
    return renderDriftDiff({
      entry,
      deployed,
      ids,
      projectDefaults,
      referencedNames: Object.fromEntries(names) as Partial<Record<ReferencedResourceType, Record<string, string>>>,
      context,
      maxLines,
    })
  } catch (cause) {
    // The renderer lists what it cannot render; this is the last resort for
    // an input it could not even list, which still names each path.
    return [
      { kind: 'reason', text: `(could not render this resource: ${cause instanceof Error ? cause.message : cause})` },
      ...picked.map((change): GenerateDiffLine => ({ kind: 'note', text: `${change.path}: changed` })),
    ]
  }
}
