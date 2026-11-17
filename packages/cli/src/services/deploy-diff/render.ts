import type { Project } from '../../constructs/project.js'
import { Session } from '../../constructs/session.js'
import type { DiffChange, DiffEntry, ResourceSync } from '../../rest/projects.js'
import {
  blankRedacted,
  carriesMarker,
  fillUnchangedFromBefore,
  type PhysicalIds,
  UNRENDERED_KEYS,
  registerProject,
  relationResourcesForAfter,
  relationResourcesFromBefore,
  toImportResource,
  UnshapeableError,
} from './import-shape.js'
import type { Resource, ResourceType } from '../../constructs/construct-codegen.js'
import { diffSides, listing, note, ruleReaches, valueAt, type RenderedLine } from './construct-diff.js'
import { isShapeChangePath } from './shape-changes.js'
import type { VariableNames } from './variable-names.js'

export type { RenderedLine } from './construct-diff.js'

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
  /** The variable each construct has in the user's code; one without an entry gets a generated name. */
  variableNames?: VariableNames
  /**
   * The properties the resource's declaration spells out (`ContextOptions.spelledOut`):
   * rendered on both sides whatever their values, so that a value moved to or
   * from a default reads as a change of that line and not as its removal.
   */
  spelledOut?: ReadonlySet<string>
  /** The most lines a diff may take before the listing is printed instead. */
  maxLines?: number
}

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

/**
 * Whether every change the entry reports is named by a cause and none is a
 * secret: such an entry is rendered as one `changed: <causes>` notice, with
 * no diff, so it needs no deployed state, and the API sends it none.
 */
export function changedByCauseAlone (entry: DiffEntry): boolean {
  const changes = entry.changes ?? []
  return changes.length > 0 && changes.every(change => change.secret !== true && change.cause !== undefined)
}

export function renderResourceDiff (input: RenderResourceInput): RenderedLine[] {
  const { entry, local, localResources, diff, project, ids, ...options } = input
  const { pruneRelations, variableNames, spelledOut, maxLines } = options
  const lines: RenderedLine[] = []
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
      ...renderShown(
        shown, marked, entry, local, localResources, diff, project, ids,
        { pruneRelations, variableNames, spelledOut, maxLines },
      ),
    )
  } catch (cause) {
    // A payload this CLI cannot shape like an import resource, a codegen that
    // does not cover the type, a script it cannot
    // parse, a construct it refuses: the listing says what changed even when
    // the rendering cannot.
    const reason = cause instanceof UnshapeableError
      ? cause.message
      : `could not render this resource: ${cause instanceof Error ? cause.message : cause}`
    if (shown.length > 0) {
      lines.push(...listing(shown, originNote, reason))
    }
  }
  for (const change of changes) {
    if (change.secret !== true) {
      continue
    }
    if (!marked.has(change)) {
      lines.push(note(`secret changed: ${change.path}${originNote(change)}`))
    } else if (originNote(change) !== '') {
      // The inline mark says which secret moved; the note says the deploy overwrites it.
      lines.push(note(`${change.path}:${originNote(change)}`))
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
  options: Pick<RenderResourceInput, 'pruneRelations' | 'variableNames' | 'spelledOut' | 'maxLines'>,
): RenderedLine[] {
  const { pruneRelations, variableNames, spelledOut, maxLines } = options
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
  if (changedByCauseAlone(entry)) {
    return [note(`changed: ${[...new Set(shown.map(change => change.cause))].join(', ')}`)]
  }
  // A change that is secret or carries a marker (a reorder of a list holding
  // one) is rendered only when a reported rule reaches its path.
  const guarded = (entry.changes ?? []).filter(
    change => change.secret === true
      || carriesMarker(change.before) || carriesMarker(change.after) || carriesMarker(change.remote),
  )
  if (!guarded.every(change => (entry.redactions ?? []).some(rule => ruleReaches(rule.path, change.path)))) {
    return listing(shown, originNote)
  }
  if (entry.before === undefined || local === undefined || local.payload === null || local.payload === undefined) {
    return listing(shown, originNote)
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
  const afterRelations = relationResourcesForAfter({ ids, local: localResources, entry, diff, pruneRelations })
  const beforeRelations = relationResourcesFromBefore(type, entry.before)
  return diffSides({
    type,
    shown,
    secrets,
    marked,
    before: {
      resource: deployed,
      relations: beforeRelations,
      markFrom: change => reportedFor(change, 'deployed'),
      label: ' (changed in Checkly)',
      textAt: change => valueAt(entry.before, change.path),
    },
    after: {
      resource: after,
      relations: afterRelations,
      markFrom: change => reportedFor(change, 'local'),
      label: ' (changed)',
      textAt: change => valueAt(local.payload, change.path),
    },
    render: {
      variableNames,
      spelledOut,
      // The code is compared as it would read in the deployed project, so
      // a property its defaults supply reads as left out.
      projectDefaults: Session.projectDefaults(),
      register: (context, program) => registerProject(context, program, project, ids, variableNames),
    },
    originNote,
    maxLines,
    // When every change is a known shape change, agreeing renderings are the
    // CLI upgrade spelling the same construct differently; the paths alone
    // cannot tell an upgrade from a user editing the same property, so a real
    // edit shows up as construct lines and never gets here.
    agreeingNote: changes => changes.length > 0
      && changes.every(change => change.origin === 'code' && isShapeChangePath(change.path, type))
      ? [note('payload format changed (CLI upgrade)')]
      : undefined,
  })
}
