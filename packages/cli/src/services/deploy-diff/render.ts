import { randomUUID } from 'node:crypto'
import { ConstructCodegen } from '../../constructs/construct-codegen.js'
import { Context, renderConstruct } from '../../constructs/internal/codegen/index.js'
import type { Project } from '../../constructs/project.js'
import type { DiffChange, DiffEntry, ResourceSync } from '../../rest/projects.js'
import { Program } from '../../sourcegen/index.js'
import {
  blankRedacted,
  carriesMarker,
  fillUnchangedFromBefore,
  isMaskedMarker,
  markChanged,
  MASK,
  nodeAt,
  type PhysicalIds,
  pointerSegments,
  UNRENDERED_KEYS,
  registerProject,
  registerUnderLogicalId,
  relationResourcesForAfter,
  relationResourcesFromBefore,
  toImportResource,
  UnshapeableError,
} from './import-shape.js'
import type { Resource, ResourceType } from '../../constructs/construct-codegen.js'
import { isShapeChangePath } from './shape-changes.js'
import { unifiedDiff } from './unified-diff.js'

/**
 * The lines printed under one updated resource of a deploy preview: the
 * construct as Checkly has it against the construct as the local code would
 * make it, rendered by the import codegen on both sides and diffed as text
 * (spec 8.5). Everything here is reporting: a failure falls back to a coarser
 * listing of the reported changes, and never to a failed deploy.
 */

export interface RenderResourceInput {
  /** The resource's preview entry, carrying `before`, `changes` and `redactions` under `detail: 'full'`. */
  entry: DiffEntry
  /** The resource's own local payload, as sent in the deploy. */
  local: ResourceSync | undefined
  /** Every resource of the local deploy payload (for the relations of a check or group). */
  localResources: readonly ResourceSync[]
  /** The whole preview (for the relation entries folded into this resource). */
  diff: readonly DiffEntry[]
  project: Project
  ids: PhysicalIds
  pruneRelations: boolean
  /** The most lines a diff may take before the listing is printed instead. */
  maxLines?: number
}

const INLINE_VALUE_CAP = 256

/**
 * Properties a codegen writes to a file of its own rather than into the
 * construct — a browser or multi-step check's script to a spec file, an API
 * check's setup and teardown scripts to support files, a dashboard's CSS to
 * a style file — leaving an `entrypoint` path behind. A change to one is
 * invisible in the construct diff and is shown as a text diff of its own,
 * whether or not the constructs differ too.
 */
const OUTSIDE_CONSTRUCT: Readonly<Record<string, ReadonlySet<string>>> = {
  check: new Set(['/script', '/localSetupScript', '/localTearDownScript']),
  dashboard: new Set(['/customCSS']),
}

function isOutsideConstruct (type: string, path: string): boolean {
  return OUTSIDE_CONSTRUCT[type]?.has(path) ?? false
}

/**
 * Whether a redaction rule reaches the path a secret change names: the two
 * agree segment for segment as far as the shorter goes, a rule's `*` standing
 * for any one segment. A rule under the path blanks inside the list the
 * change reports whole; a rule above it blanks the object that holds it.
 */
function ruleReaches (rulePath: string, changePath: string): boolean {
  const rule = pointerSegments(rulePath)
  const change = pointerSegments(changePath)
  const shared = Math.min(rule.length, change.length)
  for (let index = 0; index < shared; index += 1) {
    if (rule[index] !== '*' && rule[index] !== change[index]) {
      return false
    }
  }
  return true
}

function isHash (value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$hash' in value
}

/** A marker spelled the way the construct prints it. */
const spellMarker = (_key: string, member: unknown): unknown =>
  (isMaskedMarker(member) ? (member.$masked === 'changed' ? `${MASK} (changed)` : MASK) : member)

function inline (value: unknown): string {
  if (value === undefined) {
    return '(absent)'
  }
  if (isHash(value)) {
    return '(content)'
  }
  const text = JSON.stringify(value, spellMarker)
  return text.length > INLINE_VALUE_CAP ? `${text.slice(0, INLINE_VALUE_CAP)}…` : text
}

/** The value at an RFC 6901 pointer, or undefined when the path does not resolve. */
const valueAt = (root: unknown, pointer: string): unknown => nodeAt(root, pointerSegments(pointer))

function originNote (change: DiffChange): string {
  switch (change.origin) {
    case 'remote':
      return ' (changed in Checkly, overwritten by this deploy)'
    case 'both':
      return ' (also changed in Checkly, overwritten by this deploy)'
    case 'unmanaged':
      return ' (not managed by this project)'
    default:
      return ''
  }
}

/** One change as a line of the listing: path, values, and where it came from. */
function listChange (change: DiffChange): string {
  if (change.cause !== undefined) {
    return `${change.path}: changed (${change.cause})${originNote(change)}`
  }
  return `${change.path}: ${inline(change.before)} -> ${inline(change.after)}${originNote(change)}`
}

function listing (changes: readonly DiffChange[], reason?: string): string[] {
  const lines = reason === undefined ? [] : [`(${reason})`]
  for (const change of changes) {
    lines.push(listChange(change))
  }
  return lines
}

/** The import codegen, with the rendered construct's own variable named after its logical id on both sides. */
class SideCodegen extends ConstructCodegen {
  prepare (logicalId: string, resource: Resource, context: Context): void {
    super.prepare(logicalId, resource, context)
    registerUnderLogicalId(context, resource)
  }
}

/** A side of the comparison rendered to source text, with its relations registered first. */
function renderSide (
  resource: Resource,
  relations: readonly Resource[],
  project: Project,
  ids: PhysicalIds,
  maskedValues: ReadonlySet<string>,
): string {
  const program = new Program({
    rootDirectory: '.',
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  const context = new Context({ maskedValues })
  const codegen = new SideCodegen(program)
  registerProject(context, program, project, ids)
  for (const relation of relations) {
    codegen.prepare(relation.logicalId, relation, context)
  }
  return renderConstruct(codegen, resource.logicalId, resource, { context })
}

/**
 * The text diff of a change whose values are content (a script, a body): the
 * deployed text read from `before` at the same pointer, the local text from
 * the local payload. Either side missing means the pointer is spelled
 * differently in the two vocabularies, and only the fact is reported.
 */
function contentDiff (change: DiffChange, before: unknown, local: unknown, maxLines: number | undefined): string[] {
  const deployed = valueAt(before, change.path)
  const current = valueAt(local, change.path)
  if (typeof deployed !== 'string' || typeof current !== 'string') {
    return [`${change.path}: content changed${originNote(change)}`]
  }
  const lines = unifiedDiff(deployed, current, { beforeLabel: 'deployed', afterLabel: 'local', maxLines })
  if (lines === undefined) {
    return [`${change.path}: content changed (too large to show)${originNote(change)}`]
  }
  return [`${change.path}:${originNote(change)}`, ...lines.map(line => `  ${line}`)]
}

export function renderResourceDiff (input: RenderResourceInput): string[] {
  const { entry, local, localResources, diff, project, ids, pruneRelations, maxLines } = input
  const lines: string[] = []
  if (entry.sourceFile) {
    lines.push(`file: ${entry.sourceFile}`)
  }
  const changes = entry.changes ?? []
  // A secret is shown inline, masked, with `(changed)` on the element the
  // report marks; a secret change whose mark could not be placed (no
  // markers reported, an element the payload does not hold, a position the
  // rules blank to null) is named after the block instead, so a secret's
  // movement is visible exactly once. The block is rendered for a secret
  // change even when nothing else is reported, since the API reports the
  // list holding a moved secret whole, plain siblings' edits included.
  const shown = changes.filter(change => change.secret !== true)
  const marked = new Set<DiffChange>()
  try {
    lines.push(
      ...renderShown(shown, marked, entry, local, localResources, diff, project, ids, pruneRelations, maxLines),
    )
  } catch (cause) {
    // A payload this CLI cannot shape like an import resource, a codegen that
    // does not cover the type (a Playwright check suite), a script it cannot
    // parse, a construct it refuses: the listing says what changed even when
    // the rendering cannot.
    const reason = cause instanceof UnshapeableError
      ? cause.message
      : `could not render this resource: ${cause instanceof Error ? cause.message : cause}`
    if (shown.length > 0) {
      lines.push(...listing(shown, reason))
    }
  }
  for (const change of changes) {
    if (change.secret !== true) {
      continue
    }
    if (!marked.has(change)) {
      lines.push(`secret changed: ${change.path}${originNote(change)}`)
    } else if (originNote(change) !== '') {
      // The inline mark says which secret moved; the note says the deploy overwrites it.
      lines.push(`${change.path}:${originNote(change)}`)
    }
  }
  return lines
}

/** The reported side a mark is read from: the local side follows the code's movement, the deployed side the backend's. */
function reportedFor (change: DiffChange, side: 'local' | 'deployed'): unknown {
  if (side === 'local') {
    return change.origin === 'code' || change.origin === 'both' ? change.after : undefined
  }
  return change.origin === 'both' ? change.remote?.after : change.origin === 'remote' ? change.after : undefined
}

function renderShown (
  shown: readonly DiffChange[],
  marked: Set<DiffChange>,
  entry: DiffEntry,
  local: ResourceSync | undefined,
  localResources: readonly ResourceSync[],
  diff: readonly DiffEntry[],
  project: Project,
  ids: PhysicalIds,
  pruneRelations: boolean,
  maxLines: number | undefined,
): string[] {
  // A secret change withholds the list it is in whole, plain siblings' edits
  // included, so the construct diff — both sides blanked — is the only place
  // such an edit shows: an entry with a secret change is rendered even when
  // nothing else is reported, and a cause alone does not stand in for it.
  // Rendered only when a reported rule reaches every secret's path, though:
  // the local side's blanks come from that table, and a gap in it must not
  // print what the API withheld.
  const secrets = (entry.changes ?? []).filter(change => change.secret === true)
  const withSecrets = secrets.length > 0
  if (shown.length === 0 && !withSecrets) {
    return []
  }
  if (!withSecrets && shown.every(change => change.cause !== undefined)) {
    return [`changed: ${[...new Set(shown.map(change => change.cause))].join(', ')}`]
  }
  // A change that is secret or carries a marker (a reorder of a list holding
  // one) is rendered only when a reported rule reaches its path.
  const guarded = (entry.changes ?? []).filter(
    change => change.secret === true
      || carriesMarker(change.before) || carriesMarker(change.after) || carriesMarker(change.remote),
  )
  if (!guarded.every(change => (entry.redactions ?? []).some(rule => ruleReaches(rule.path, change.path)))) {
    return listing(shown)
  }
  if (entry.before === undefined || local === undefined || local.payload === null || local.payload === undefined) {
    return listing(shown)
  }
  const { type, logicalId } = entry
  // The deployed side is the import format already, straight from the API,
  // less what neither side renders — dropped before the local side is filled
  // from it, so the fill cannot copy it across.
  const before = { ...entry.before }
  for (const key of UNRENDERED_KEYS) {
    delete before[key]
  }
  // Both sides masked by the same rules; the deployed side arrives blanked.
  // A copy, since the marks are written in place and `entry.before` is
  // read again for relations and text diffs.
  const deployed: Resource = {
    type: type as ResourceType,
    logicalId,
    payload: blankRedacted(structuredClone(before), entry.redactions),
  }
  // Shaped first, then filled with what the deploy leaves as it is, masked
  // last: the rules are spelled in the import format's vocabulary, which is
  // what the shaped payload is in.
  const shaped = toImportResource(deployed.type, logicalId, local.payload, ids)
  fillUnchangedFromBefore(shaped.payload as Record<string, unknown>, before, entry.changes ?? [])
  const after: Resource = { ...shaped, payload: blankRedacted(shaped.payload, entry.redactions) }
  // Then the marks: the element whose secret moved reads `(changed)` on the
  // side that moved it, so the diff names the secret beside its key. Each
  // change writes its own sentinel, unguessable by any value the account or
  // the code could hold, so only a change whose sentinel reached the returned
  // lines counts as marked; the sentinels read `(changed)` in the output.
  // The codegen prints a secret only as one of these strings.
  const nonce = randomUUID()
  const sentinels = new Map<DiffChange, { local: string, deployed: string }>()
  secrets.forEach((change, index) => {
    const localLabel = `${MASK} (changed#${nonce}-${index})`
    const deployedLabel = `${MASK} (changed in Checkly#${nonce}-${index})`
    const onLocal = markChanged(after.payload, change.path, reportedFor(change, 'local'), localLabel)
    const onDeployed = markChanged(deployed.payload, change.path, reportedFor(change, 'deployed'), deployedLabel)
    if (onLocal || onDeployed) {
      sentinels.set(change, { local: localLabel, deployed: deployedLabel })
    }
  })
  const maskedValues = new Set([MASK, ...[...sentinels.values()].flatMap(pair => [pair.local, pair.deployed])])
  const showing = (lines: string[]): string[] => {
    for (const [change, pair] of sentinels) {
      if (lines.some(line => line.includes(pair.local) || line.includes(pair.deployed))) {
        marked.add(change)
      }
    }
    const sentinel = new RegExp(` \\(changed( in Checkly)?#${nonce}-\\d+\\)`, 'g')
    return lines.map(line => line.replace(sentinel, ' (changed$1)'))
  }
  const afterRelations = relationResourcesForAfter({ ids, local: localResources, entry, diff, pruneRelations })
  const beforeText = renderSide(deployed, relationResourcesFromBefore(type, entry.before), project, ids, maskedValues)
  const afterText = renderSide(after, afterRelations, project, ids, maskedValues)
  const rendered = unifiedDiff(beforeText, afterText, { beforeLabel: 'deployed', afterLabel: 'local', maxLines })
  if (rendered === undefined) {
    return shown.length > 0 ? listing(shown, 'the construct diff is too large to show') : []
  }
  if (rendered.length > 0) {
    // The constructs differ. What they cannot show follows: a property kept
    // in a file of its own as a text diff, and a change that is only a cause
    // (a new code bundle, a dependency list) as a line.
    const lines = [...rendered]
    for (const change of shown) {
      if (isOutsideConstruct(type, change.path)) {
        lines.push(...contentDiff(change, entry.before, local.payload, maxLines))
      } else if (change.cause !== undefined) {
        lines.push(listChange(change))
      }
    }
    return showing(lines)
  }
  // The renderings agree. When every change is a known shape change, that is
  // the CLI upgrade spelling the same construct differently; the paths alone
  // cannot tell an upgrade from a user editing the same property, so a real
  // edit shows up as construct lines above and never gets here.
  if (shown.length > 0 && shown.every(change => change.origin === 'code' && isShapeChangePath(change.path))) {
    return ['payload format changed (CLI upgrade)']
  }
  // Otherwise what changed lives outside the construct (a script in its own
  // file, a request body), or is a value the codegen elides.
  const lines: string[] = []
  for (const change of shown) {
    const hashed = isHash(change.before) || isHash(change.after) || isHash(change.remote?.after)
    if (hashed || isOutsideConstruct(type, change.path)) {
      lines.push(...contentDiff(change, entry.before, local.payload, maxLines))
    } else {
      lines.push(listChange(change))
    }
  }
  return lines
}
