import chalk from 'chalk'

import {
  AlertChannel, AlertChannelSubscription, Check, CheckGroup, Dashboard,
  MaintenanceWindow, PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  Project, ProjectData, StatusPage, StatusPageService,
  StatusPageV3AutomationRule, StatusPageV3Component,
} from '../../constructs/index.js'
import { padColumn, visWidth } from '../../formatters/render.js'
import type { DeployResourceSync, DiffEntry } from '../../rest/projects.js'
import { physicalIdsFromPlan } from './import-shape.js'
import { isPrunedRelation, onlyUnmanagedChanges } from './plan-summary.js'
import { renderResourceDiff, type RenderedLine } from './render.js'

/**
 * The text `checkly deploy` prints for a plan: what `--preview` shows, what
 * `--output` prints after a deploy, and what a deploy refused for a stale plan
 * prints in its place. Shaped like a plan: an overview of every touched
 * resource with a marker per action, the construct diff of each updated
 * resource, and the totals. The markers carry the meaning; colour is for a
 * terminal and chalk drops it for a pipe or under `NO_COLOR`.
 */

// eslint-disable-next-line no-restricted-syntax
export enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
  // Reported for a resource removed from code that is kept in the account
  // (managed from the Checkly web app from then on) instead of deleted.
  DETACH = 'DETACH',
  // What the same case was called before the deploy diff landed. Still
  // accepted so a newer CLI keeps rendering an older API's answer.
  DETACHED = 'DETACHED',
  // A resource the deploy leaves alone because code and account agree.
  UNCHANGED = 'UNCHANGED',
}

/** How a resource type reads when there is no construct to name it by (a deleted resource, a relation). */
export const PRETTY_RESOURCE_TYPES: Record<string, string> = {
  [Check.__checklyType]: 'Check',
  [AlertChannel.__checklyType]: 'AlertChannel',
  [CheckGroup.__checklyType]: 'CheckGroup',
  [MaintenanceWindow.__checklyType]: 'MaintenanceWindow',
  [PrivateLocation.__checklyType]: 'PrivateLocation',
  [Dashboard.__checklyType]: 'Dashboard',
  [StatusPage.__checklyType]: 'StatusPage',
  [StatusPageService.__checklyType]: 'StatusPageService',
  [StatusPageV3Component.__checklyType]: 'StatusPageV3Component',
  [StatusPageV3AutomationRule.__checklyType]: 'StatusPageV3AutomationRule',
}

// Internal resources that users don't create directly. They are reported as
// part of their owning check, so we exclude them from delete previews/guards.
export const NON_REPORTED_TYPES = [
  AlertChannelSubscription.__checklyType,
  PrivateLocationCheckAssignment.__checklyType,
  PrivateLocationGroupAssignment.__checklyType,
]

export interface PreviewOutputInput {
  /** The heading line; none when the lines that follow name the deploy already. */
  heading?: { title: string, projectName: string, accountName?: string }
  diff: DiffEntry[]
  /** The plan was carried out: the totals read as what happened, not what would. */
  done?: boolean
  project: Project
  /** Print each resource's name and id under its row. */
  verbose?: boolean
  /** Whether this deploy deletes the relations it does not manage. */
  pruneRelations?: boolean
  /**
   * The preview plan with each changed resource's deployed state, and the
   * local payload it was computed for: with these, every updated resource
   * prints the diff of its construct as deployed against as in code.
   */
  rendering?: { plan: DiffEntry[], local: DeployResourceSync[] }
  /** Printed with the command that deploys exactly this plan. */
  planToken?: string
}

interface Row {
  marker: string
  type: string
  logicalId: string
  /** The dim source file, or the note that says what happens to the resource. */
  detail: string
  /** Lines printed under the row with `verbose`. */
  sub: string[]
}

interface Listed {
  resourceType: string
  logicalId: string
  physicalId?: string | number
  construct?: any
}

const compareEntries = (a: Listed, b: Listed): number =>
  a.resourceType.localeCompare(b.resourceType) || a.logicalId.localeCompare(b.logicalId)

const GAP = chalk.dim('⋯')

const MARKER = {
  create: chalk.green('+'),
  update: chalk.yellow('~'),
  delete: chalk.red('-'),
  detach: chalk.yellow('-'),
  prune: chalk.red('-'),
  warn: chalk.yellow('!'),
  skip: chalk.dim('·'),
}

export function formatPreview (input: PreviewOutputInput): string {
  const { heading, diff, done = false, project, verbose = false, pruneRelations = false, rendering, planToken } = input

  const updating: Listed[] = []
  const creating: Listed[] = []
  const deleting: Listed[] = []
  const detaching: Listed[] = []
  const pruning: Listed[] = []
  const unmanaged: Listed[] = []
  let unchanged = 0
  for (const change of diff) {
    const { type, logicalId, physicalId, action, changes } = change
    if (NON_REPORTED_TYPES.some(t => t === type)) {
      // A relation the project manages is reported as part of the check or
      // group it belongs to, since users do not declare these directly. One
      // the project does NOT manage is only ever reported when --prune-relations
      // would delete it, and that is worth its own line.
      if (isPrunedRelation(change)) {
        pruning.push({ resourceType: type, logicalId })
      }
      continue
    }
    // Relations the project does not manage are reported on their owning
    // check or group whether or not they would be deleted. Without
    // --prune-relations the deploy leaves them — and the resource — alone, so
    // listing it as an update would name a write that never happens.
    // Never an update: what the deploy deletes is the relation, not the
    // check or group it hangs off. With --prune-relations the relation's own
    // entry is already listed as pruned, so the resource needs no line of
    // its own — and advising the flag the user just passed would be absurd.
    if (onlyUnmanagedChanges(change)) {
      if (!pruneRelations) {
        unmanaged.push({ resourceType: type, logicalId })
      }
      continue
    }
    const construct = project.data[type as keyof ProjectData][logicalId]
    if (action === ResourceDeployStatus.UPDATE) {
      updating.push({ resourceType: type, logicalId, physicalId, construct })
    } else if (action === ResourceDeployStatus.UNCHANGED) {
      // A resource whose own properties agree with the account can still have
      // changed alert channels or private locations, which are reported on it
      // rather than as resources of their own; only an entry with nothing at
      // all to report counts as unchanged.
      if ((changes?.length ?? 0) > 0) {
        updating.push({ resourceType: type, logicalId, physicalId, construct })
      } else {
        unchanged++
      }
    } else if (action === ResourceDeployStatus.CREATE) {
      creating.push({ resourceType: type, logicalId, physicalId, construct })
    } else if (action === ResourceDeployStatus.DELETE) {
      // Since the resource is being deleted, the construct isn't in the project.
      deleting.push({ resourceType: type, logicalId })
    } else if (
      action === ResourceDeployStatus.DETACH
      || action === ResourceDeployStatus.DETACHED
    ) {
      // Removed from code but kept in the account, so the construct is not in
      // the project any more.
      detaching.push({ resourceType: type, logicalId })
    }
  }

  // testOnly checks weren't sent to the BE and won't be in the plan.
  // We load them from the `project` instead.
  const skipping: Listed[] = project
    .getTestOnlyConstructs().map(construct => ({
      logicalId: construct.logicalId,
      resourceType: construct.type,
      construct,
    }))
    // A check that already exists in Checkly and just gained `testOnly: true`
    // is both deleted and skipped; it is shown once, as deleted.
    .filter(skip =>
      !deleting.find(
        deletion => deletion.logicalId === skip.logicalId && deletion.resourceType === skip.resourceType,
      ),
    )

  // Resources without constructs are created dynamically on the fly (a
  // non-member private location) and have nothing to show.
  const sortedCreating = creating.filter(({ construct }) => Boolean(construct)).sort(compareEntries)
  const sortedUpdating = updating.filter(({ construct }) => Boolean(construct)).sort(compareEntries)
  const sortedDeleting = deleting.sort(compareEntries)
  const sortedDetaching = detaching.sort(compareEntries)
  const sortedPruning = pruning.sort(compareEntries)
  const sortedUnmanaged = unmanaged.sort(compareEntries)

  if (!sortedCreating.length && !sortedDeleting.length && !sortedDetaching.length
    && !sortedUpdating.length && !sortedPruning.length && !sortedUnmanaged.length
    && !unchanged && !skipping.length) {
    return '\nNo checks were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n'
  }

  const sourceFileOf = ({ resourceType, logicalId }: Listed): string | undefined => {
    const local = rendering?.local.find(resource => resource.type === resourceType && resource.logicalId === logicalId)
    const planned = diff.find(entry => entry.type === resourceType && entry.logicalId === logicalId)
    return local?.sourceFile ?? planned?.sourceFile ?? undefined
  }
  const subLines = ({ physicalId, construct }: Listed): string[] => {
    if (!verbose) {
      return []
    }
    const lines: string[] = []
    if (construct?.name) {
      lines.push(chalk.dim(`name: ${construct.name}`))
    }
    if (physicalId) {
      lines.push(chalk.dim(`id: ${physicalId}`))
    }
    return lines
  }
  const withConstruct = (marker: string, listed: Listed): Row => ({
    marker,
    type: listed.construct.constructor.name,
    logicalId: listed.logicalId,
    detail: chalk.dim(sourceFileOf(listed) ?? ''),
    sub: subLines(listed),
  })
  const withNote = (marker: string, listed: Listed, note: string): Row => ({
    marker,
    type: PRETTY_RESOURCE_TYPES[listed.resourceType] ?? listed.resourceType,
    logicalId: listed.logicalId,
    detail: note,
    sub: [],
  })

  const rows: Row[] = [
    ...sortedCreating.map(listed => withConstruct(MARKER.create, listed)),
    ...sortedUpdating.map(listed => withConstruct(MARKER.update, listed)),
    ...sortedDeleting.map(listed => withNote(MARKER.delete, listed, chalk.red('permanently deleted, run history lost'))),
    ...sortedDetaching.map(listed => withNote(
      MARKER.detach, listed, chalk.yellow('kept in your Checkly account, now managed from the Checkly web app'),
    )),
    ...sortedPruning.map(listed => withNote(
      MARKER.prune, listed, chalk.red('relation not managed by this project, deleted by --prune-relations'),
    )),
    ...sortedUnmanaged.map(listed => withNote(
      MARKER.warn, listed,
      chalk.yellow('has alert channels or private locations this project does not manage (pass --prune-relations to delete them)'),
    )),
    ...skipping.sort(compareEntries).map(listed => ({
      ...withConstruct(MARKER.skip, listed),
      detail: chalk.dim('skipped (testOnly)'),
    })),
  ]

  const output: string[] = []
  if (heading !== undefined) {
    const { title, projectName, accountName } = heading
    const account = accountName !== undefined ? ` ${chalk.dim('→')} account ${chalk.bold(accountName)}` : ''
    output.push(`${chalk.bold(title)} ${chalk.dim('·')} ${projectName}${account}`)
    output.push('')
  }

  const typeWidth = Math.max(0, ...rows.map(row => visWidth(row.type)))
  const idWidth = Math.max(0, ...rows.map(row => visWidth(row.logicalId)))
  for (const row of rows) {
    const type = padColumn(row.type, typeWidth)
    const logicalId = padColumn(chalk.bold(row.logicalId), idWidth)
    output.push(`  ${row.marker} ${type}  ${logicalId}  ${row.detail}`.trimEnd())
    for (const line of row.sub) {
      output.push(`      ${line}`)
    }
  }
  if (unchanged) {
    output.push(`    ${chalk.dim(`${unchanged} unchanged`)}`)
  }
  output.push('')

  if (rendering !== undefined) {
    const ids = physicalIdsFromPlan(rendering.plan, rendering.local)
    for (const listed of sortedUpdating) {
      const { resourceType, logicalId } = listed
      // The entry to render is the plan's, whether this listing is the plan
      // itself or the deploy that carried it out.
      const planned = rendering.plan.find(entry => entry.type === resourceType && entry.logicalId === logicalId)
      if (planned === undefined || planned.before === undefined) {
        continue
      }
      const lines = renderResourceDiff({
        entry: planned,
        local: rendering.local.find(resource => resource.type === resourceType && resource.logicalId === logicalId),
        localResources: rendering.local,
        diff: rendering.plan,
        project,
        ids,
        pruneRelations,
      })
      if (lines.length === 0) {
        continue
      }
      const file = sourceFileOf(listed)
      output.push(
        `${MARKER.update} ${chalk.bold(listed.construct.constructor.name)} ${chalk.bold(logicalId)}`
        + (file !== undefined ? `  ${chalk.dim(file)}` : ''),
      )
      // A hunk boundary is shown as the gap between two hunks of the same
      // diff, so the first hunk of the construct diff, and the first of a
      // nested text diff (which follows the note naming its property), get
      // none.
      let previous: RenderedLine | undefined
      for (const line of lines) {
        const hunk = line.kind === 'hunk' || (line.kind === 'nested' && line.line.kind === 'hunk')
        const sameDiff = previous !== undefined
          && (line.kind === 'nested' ? previous.kind === 'nested' : previous.kind !== 'note' && previous.kind !== 'reason')
        previous = line
        if (hunk && !sameDiff) {
          continue
        }
        output.push(`  ${styled(line)}`.trimEnd())
      }
      output.push('')
    }
  }

  const counted = (count: number, text: string, colour: (s: string) => string): string[] =>
    count > 0 ? [colour(`${count} ${text}`)] : []
  output.push([
    ...counted(sortedCreating.length, done ? 'created' : 'to create', chalk.green),
    ...counted(sortedUpdating.length, done ? 'updated' : 'to update', chalk.yellow),
    ...counted(sortedDeleting.length, done ? 'deleted' : 'to delete', chalk.red),
    ...counted(sortedDetaching.length, 'kept in your account', chalk.yellow),
    ...counted(sortedPruning.length, sortedPruning.length === 1 ? 'relation pruned' : 'relations pruned', chalk.red),
    ...counted(skipping.length, 'skipped (testOnly)', chalk.dim),
    ...counted(sortedUnmanaged.length, 'with relations this project does not manage', chalk.yellow),
    chalk.dim(`${unchanged} unchanged`),
  ].join(', '))
  if (planToken !== undefined) {
    output.push(`${chalk.dim('Deploy exactly this plan:')} checkly deploy --plan-token ${planToken}`)
  }
  // A blank line closes the plan, whatever follows it.
  output.push('')
  return output.join('\n')
}

/** One rendered line with its marker and colour; a nested line sits two columns further in. */
function styled (line: RenderedLine): string {
  switch (line.kind) {
    case 'add':
      return chalk.green(`+ ${line.text}`)
    case 'remove':
      return chalk.red(`- ${line.text}`)
    case 'context':
      return `  ${chalk.grey(line.text)}`
    case 'hunk':
      return `  ${GAP}`
    case 'note':
      return chalk.yellow(`~ ${line.text}`)
    case 'reason':
      return `  ${chalk.dim(line.text)}`
    case 'nested':
      return `  ${styled(line.line)}`
  }
}
