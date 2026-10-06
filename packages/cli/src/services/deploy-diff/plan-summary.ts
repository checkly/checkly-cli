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
 * True for a resource the deploy writes although no difference was found in
 * it. Checkly had no earlier planned deploy to compare it with (the project's
 * first plan, or the first after a deploy without one), compared the code with
 * the deployed resource instead, and writes it once more so that later plans
 * have something to compare against. It is a write, so it is confirmed like
 * one, but not a change worth a row of its own.
 *
 * Relations the project does not manage are reported on the resource without
 * being a difference in it, so a resource with only those still counts.
 */
export function isBaselineRewrite (entry: DiffEntry): boolean {
  return entry.action === 'UPDATE' && entry.basis === 'live'
    && (entry.changes ?? []).every(change => change.origin === 'unmanaged')
}

/**
 * Entries worth showing: a resource the deploy touches. An `UNCHANGED` entry
 * with no changes of its own is the converged case and says nothing, a relation
 * folded into its parent is already reported there, and a resource whose only
 * reported changes are unmanaged relations is not written either.
 */
function reportable (entry: DiffEntry, { foldedTypes }: PlanSummaryOptions): boolean {
  // A relation the deploy would delete is reported on its own entry, folded
  // into its parent for display. It is the one folded entry worth a line of its
  // own: nothing else in the plan says which relations are about to go.
  if (isPrunedRelation(entry)) {
    return true
  }
  if (entry.foldedInto !== undefined || foldedTypes.includes(entry.type)) {
    return false
  }
  // Written whatever was found, so it is never "nothing to apply".
  if (isBaselineRewrite(entry)) {
    return true
  }
  // Whether or not the relations are pruned, the resource they hang off is not
  // written: with `--prune-relations` the relation's own entry carries the line.
  if (onlyUnmanagedChanges(entry)) {
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
  const rewrites = shown.filter(isBaselineRewrite)
  const rest = shown.filter(entry => entry.action !== 'DELETE' && !detached(entry) && !isBaselineRewrite(entry))

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
      const verb = entry.action === 'CREATE' ? 'Create' : 'Update'
      return `${verb} ${label(entry, options)}`
    }),
  ]

  const hidden = rest.length - Math.min(rest.length, MAX_LISTED_CHANGES)
  if (hidden > 0) {
    lines.push(`Create or update ${hidden} more resource(s); run with --preview to see them all`)
  }
  // One line for all of them: a line per resource would bury the changes
  // above. It says what was found and what was not looked at, since this line
  // is all an agent or a CI log shows of these resources.
  if (rewrites.length > 0) {
    lines.push(`Write ${rewrites.length} resource(s) again in which no difference from what is live was found; `
      + 'a value set only in Checkly may be reset')
  }

  return lines
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
