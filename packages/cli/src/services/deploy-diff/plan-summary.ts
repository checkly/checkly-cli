import { isDeepStrictEqual } from 'node:util'

import type { DiffChange, DiffEntry } from '../../rest/projects.js'

/**
 * Turns a deploy plan into the two forms `confirmOrAbort` needs: the
 * human-readable `changes` lines of its preview, and the machine-readable plan
 * that goes into the agent envelope next to them.
 */

/**
 * How many create/update lines the confirmation prompt lists before summing up
 * the rest. A first deploy of a large project would otherwise scroll its own
 * question off the screen. Deletions are never summarized away: they are the
 * part of a plan that loses data, so every one of them is named.
 */
const MAX_LISTED_CHANGES = 20

/**
 * Largest value the agent envelope carries inline, serialized. Repeating a
 * whole script, response body or environment-variable list in a confirmation
 * envelope helps nobody and can be megabytes; what is left in its place says
 * how long it was.
 */
const MAX_INLINE_VALUE = 256

export interface PlanSummaryOptions {
  /** Display names per resource type, for the types a user declares. */
  prettyTypes: Record<string, string>
  /** Types reported as part of their owning check or group rather than on their own. */
  foldedTypes: readonly string[]
}

/** A relation the project does not manage, which this deploy will delete. */
export function isPrunedRelation (entry: DiffEntry): boolean {
  return entry.action === 'DELETE' && entry.origin === 'unmanaged'
}

/**
 * True when every change reported on a resource is a relation the project does
 * not manage. Checkly reports those on the owning check or group whether or not
 * the deploy would delete them, and without `--prune-relations` it deletes
 * nothing — so the resource itself is untouched and naming it as an update
 * would describe a write that never happens.
 */
export function onlyUnmanagedChanges (entry: DiffEntry): boolean {
  return (entry.changes?.length ?? 0) > 0 && entry.changes!.every(change => change.origin === 'unmanaged')
}

/**
 * True for a resource the deploy writes only to set a baseline: Checkly
 * compared it with what is live for want of an earlier planned deploy
 * (`basis: 'live'`) and found nothing to report, or nothing but relations the
 * project does not manage. The write happens whatever was found, and the
 * reported changes are not exhaustive (a secret or content Checkly does not
 * return may differ), so the plan lists the resource; but as a baseline, not
 * as the update a resource with a difference to show is. Relations the
 * project does not manage count for nothing here whether or not the deploy
 * prunes them: pruned, each is deleted on an entry of its own, which the plan
 * lists; not pruned, they are left alone, which the `!` row says.
 */
export function writtenForBaseline (entry: DiffEntry): boolean {
  return entry.basis === 'live' && entry.action === 'UPDATE'
    && (entry.changes ?? []).every(change => change.origin === 'unmanaged')
}

/** A relation reported as part of the check or group it belongs to, not as a resource of its own. */
function isFolded (entry: DiffEntry, foldedTypes: readonly string[]): boolean {
  return entry.foldedInto !== undefined || foldedTypes.includes(entry.type)
}

/**
 * Entries worth showing: a resource the deploy touches. An `UNCHANGED` entry
 * with no changes of its own is the converged case and says nothing, a relation
 * folded into its parent is already reported there, and a resource whose only
 * reported changes are unmanaged relations is not written either, unless the
 * deploy writes it to set the baseline for later plans.
 */
function reportable (entry: DiffEntry, { foldedTypes }: PlanSummaryOptions): boolean {
  // A relation the deploy would delete is reported on its own entry, folded
  // into its parent for display. It is the one folded entry worth a line of its
  // own: nothing else in the plan says which relations are about to go.
  if (isPrunedRelation(entry)) {
    return true
  }
  if (isFolded(entry, foldedTypes)) {
    return false
  }
  // Whether or not the relations are pruned, the resource they hang off is not
  // written: with `--prune-relations` the relation's own entry carries the line.
  // Except when Checkly had no usable state from an earlier planned deploy and
  // compared the resource with what is deployed (`basis: 'live'`): the deploy
  // writes it whatever was found, so it is never "nothing to apply".
  if (onlyUnmanagedChanges(entry) && entry.basis !== 'live') {
    return false
  }
  return entry.action !== 'UNCHANGED' || (entry.changes?.length ?? 0) > 0
}

/**
 * True when the plan gives the deploy nothing to write: no resource to create,
 * update, delete or detach, and no relation to prune. Relations the project
 * does not manage and is not pruning do not count, since the deploy leaves
 * them alone.
 */
export function planHasNoChanges (diff: DiffEntry[], options: PlanSummaryOptions): boolean {
  return !diff.some(entry => reportable(entry, options))
}

function label (entry: DiffEntry, { prettyTypes }: PlanSummaryOptions): string {
  return `${prettyTypes[entry.type] ?? entry.type}: ${entry.logicalId}`
}

/**
 * One line per resource the deploy would touch, deletions first and in full,
 * for the confirmation prompt and the agent envelope.
 */
export function planChangeLines (diff: DiffEntry[], options: PlanSummaryOptions): string[] {
  const shown = diff.filter(entry => reportable(entry, options))
  const deletions = shown.filter(entry => entry.action === 'DELETE')
  // `DETACHED` is what an API older than the deploy diff calls the same thing.
  const detached = (entry: DiffEntry) => entry.action === 'DETACH' || entry.action === 'DETACHED'
  const detachments = shown.filter(detached)
  // What the deploy changes comes first, so that a long first plan does not
  // push its few real edits past the window with resources it only baselines.
  const rest = [
    ...shown.filter(entry => entry.action !== 'DELETE' && !detached(entry) && !writtenForBaseline(entry)),
    ...shown.filter(writtenForBaseline),
  ]

  const lines = [
    ...deletions.map(entry => (isPrunedRelation(entry)
      // Not a resource the project declared, so it has no run history to lose;
      // what it names is the check or group it hangs off, when the plan says.
      ? `Delete the ${options.prettyTypes[entry.type] ?? entry.type} `
      + (entry.foldedInto
        ? `on ${options.prettyTypes[entry.foldedInto.type] ?? entry.foldedInto.type}: `
        + `${entry.foldedInto.logicalId}, `
        : `${entry.logicalId}, `)
      + 'which this project does not manage'
      : `Permanently delete ${label(entry, options)}, losing its run history`)),
    ...detachments.map(entry => `Keep ${label(entry, options)} in your Checkly account, managed from the web app`),
    ...rest.slice(0, MAX_LISTED_CHANGES).map(entry => {
      const verb = entry.action === 'CREATE'
        ? 'Create'
        : writtenForBaseline(entry) ? 'Set a baseline for' : 'Update'
      return `${verb} ${label(entry, options)}`
    }),
  ]

  const hidden = rest.slice(MAX_LISTED_CHANGES)
  const hiddenBaselines = hidden.filter(writtenForBaseline).length
  const hiddenChanges = hidden.length - hiddenBaselines
  const summed = [
    ...(hiddenChanges > 0 ? [`Create or update ${hiddenChanges} more resource(s)`] : []),
    ...(hiddenBaselines > 0 ? [`Set a baseline for ${hiddenBaselines} more resource(s)`] : []),
  ]
  if (summed.length > 0) {
    lines.push(`${summed.join(' and ')}; run with --preview to see them all`)
  }
  return lines
}

/**
 * A resource the plan reports as changed in Checkly since the last planned
 * deploy, which the deploy would overwrite: properties edited in Checkly
 * (`paths`), or the resource deleted there, which the deploy creates again.
 */
export interface DriftedResource {
  type: string
  logicalId: string
  deleted: boolean
  paths: string[]
}

/**
 * Whether the deploy would overwrite a value changed in Checkly. A path both
 * sides moved is settled when the code now holds what Checkly holds (the
 * user copied the edit into the code), and Checkly can still report it then.
 * A secret or a change reported by cause alone carries no comparable values,
 * so it counts.
 */
function overwritesRemoteChange (change: DiffChange): boolean {
  if (change.origin === 'remote') {
    return true
  }
  if (change.origin !== 'both') {
    return false
  }
  return change.secret === true || change.cause !== undefined || !isDeepStrictEqual(change.after, change.remote?.after)
}

/**
 * The resources the plan reports as changed in Checkly, one per check, group
 * or other declared resource: a relation's drift (an alert channel
 * subscription removed in Checkly, say) is reported on the resource it is
 * folded into. Relations the project does not manage are not drift: they are
 * left alone unless `--prune-relations` asks for them to be deleted.
 *
 * Blind to a resource without a baseline (`basis: 'live'`): Checkly compares
 * it with what is deployed, so code changes and edits made in Checkly look
 * the same. {@link unbaselinedResources} counts those. Also blind to a
 * resource the code removes: Checkly reports no changes on a deletion.
 */
export function findDrift (diff: readonly DiffEntry[], { foldedTypes }: PlanSummaryOptions): DriftedResource[] {
  const byResource = new Map<string, DriftedResource>()
  for (const entry of diff) {
    const remotePaths = (entry.changes ?? [])
      .filter(overwritesRemoteChange)
      .map(change => change.path)
    // Checkly marks a creation `remote` when the resource the last deploy
    // wrote was deleted in Checkly since.
    const recreated = entry.action === 'CREATE' && entry.origin === 'remote'
    if (remotePaths.length === 0 && !recreated) {
      continue
    }
    const owner = entry.foldedInto ?? entry
    const key = `${owner.type}:${owner.logicalId}`
    const resource = byResource.get(key)
      ?? { type: owner.type, logicalId: owner.logicalId, deleted: false, paths: [] }
    byResource.set(key, resource)
    if (recreated && !isFolded(entry, foldedTypes)) {
      resource.deleted = true
    } else if (recreated) {
      // A relation has no path on its owner; its type says what was removed.
      resource.paths.push(entry.type)
    }
    resource.paths.push(...remotePaths)
  }
  return [...byResource.values()]
    .map(resource => ({ ...resource, paths: [...new Set(resource.paths)] }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.logicalId.localeCompare(b.logicalId))
}

/**
 * How many declared resources Checkly had no earlier planned deploy to
 * compare with (`basis: 'live'`), which {@link findDrift} cannot check.
 */
export function unbaselinedResources (diff: readonly DiffEntry[], { foldedTypes }: PlanSummaryOptions): number {
  return diff.filter(entry =>
    entry.basis === 'live' && !isFolded(entry, foldedTypes),
  ).length
}

/** One line per drifted resource, saying what changed in Checkly and what the deploy would do about it. */
export function driftLines (drift: readonly DriftedResource[], options: PlanSummaryOptions): string[] {
  return drift.map(resource => {
    const name = `${options.prettyTypes[resource.type] ?? resource.type}: ${resource.logicalId}`
    return resource.deleted
      ? `${name} was deleted in Checkly; this deploy would create it again`
      : `${name} was changed in Checkly (${resource.paths.join(', ')}); this deploy would overwrite it`
  })
}

/**
 * A value small enough to carry, or `{ $omitted: <length> }` in its place.
 */
function reduceValue (value: unknown): unknown {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  // Not only strings: a leaf can be a whole collection (a check group's
  // environment variables, a status page's cards), and one of those holding a
  // large value would otherwise go into the envelope in full.
  const size = typeof value === 'string' ? value.length : JSON.stringify(value)?.length ?? 0
  return size > MAX_INLINE_VALUE ? { $omitted: size } : value
}

function reduceChange (change: DiffChange): DiffChange {
  return {
    ...change,
    ...'before' in change ? { before: reduceValue(change.before) } : {},
    ...'after' in change ? { after: reduceValue(change.after) } : {},
    ...change.remote !== undefined
      ? {
          remote: {
            ...'before' in change.remote ? { before: reduceValue(change.remote.before) } : {},
            ...'after' in change.remote ? { after: reduceValue(change.remote.after) } : {},
          },
        }
      : {},
  }
}

/**
 * The plan as the agent envelope carries it: every entry and every changed
 * property, but without the resources' full current state and without the
 * large values the rendered diff needs. Rendering happens in the terminal
 * output; the envelope is there to be read, and it is the same plan, pinned by
 * the same `planToken`.
 */
export function reducePlanForAgent (diff: DiffEntry[]): DiffEntry[] {
  return diff.map(entry => {
    const reduced: DiffEntry = { ...entry }
    // The rule table is applied to `before`; without the state, it is dead weight.
    delete reduced.before
    delete reduced.redactions
    if (entry.changes !== undefined) {
      reduced.changes = entry.changes.map(reduceChange)
    }
    return reduced
  })
}
