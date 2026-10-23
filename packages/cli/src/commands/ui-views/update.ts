import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../formatters/render.js'
import { formatViewDetail } from '../../formatters/views.js'
import type { UpdateViewPayload, View, ViewVisibility } from '../../rest/views.js'
import {
  describeViewError,
  normalizeViewCounterChange,
  parseViewFilters,
  toViewPageOption,
  viewCounterClearOption,
  viewCounterOptions,
} from '../../helpers/views.js'

const counterChangeOptions = [...viewCounterOptions, viewCounterClearOption]

export default class UiViewsUpdate extends AuthCommand {
  static hidden = false
  static idempotent = true
  static description = 'Change a saved view\'s name, filters, counter or visibility.'

  static examples = [
    'checkly ui-views update <id> --name "Failing in production"',
    'checkly ui-views update <id> --filters \'{"status":["failing","degraded"]}\' --counter none',
    'checkly ui-views update <id> --share',
    'checkly ui-views update <id> --private',
  ]

  static args = {
    id: Args.string({
      description: 'The ID of the view to update.',
      required: true,
    }),
  }

  static flags = {
    'name': Flags.string({
      description: 'New view name (1-200 characters).',
    }),
    'filters': Flags.string({
      description: 'New view filters as a JSON object; replaces the current filters. '
        + 'Run `checkly skills manage ui-views` for the filters each page accepts.',
    }),
    'counter': Flags.string({
      description: `Count shown on the view tab: ${viewCounterOptions.join(', ')}, `
        + `or ${viewCounterClearOption} to remove it. Monitors views only.`,
    }),
    'share': Flags.boolean({
      description: 'Share the view with everyone on the account.',
      exclusive: ['private'],
    }),
    'private': Flags.boolean({
      description: 'Make a shared view private again. It goes back to its creator while they are still a member, otherwise to you.',
      exclusive: ['share'],
    }),
    'output': outputFlag({ default: 'table' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags, metadata } = await this.parse(UiViewsUpdate)
    this.style.outputFormat = flags.output

    const payload: UpdateViewPayload = {}

    if (flags.name !== undefined) {
      payload.name = flags.name
    }

    if (flags.filters !== undefined) {
      try {
        payload.filters = parseViewFilters(flags.filters)
      } catch (err: any) {
        this.error(err.message)
      }
    }

    if (flags.counter !== undefined) {
      const counter = normalizeViewCounterChange(flags.counter)
      if (counter === undefined) {
        this.error(`Invalid --counter "${flags.counter}". Valid values: ${counterChangeOptions.join(', ')}.`)
      }
      payload.counter = counter
    }

    if (flags.share) {
      payload.visibility = 'ACCOUNT'
    } else if (flags.private) {
      payload.visibility = 'PRIVATE'
    }

    if (Object.keys(payload).length === 0) {
      this.error('Nothing to update. Pass at least one of --name, --filters, --counter, --share or --private.')
    }

    let view: View
    try {
      view = await api.views.get(args.id)
    } catch (err: any) {
      this.style.longError('Failed to update view.', describeViewError(err) ?? err)
      process.exitCode = 1
      return
    }

    if (payload.counter && view.page !== 'monitors') {
      this.error('--counter is only supported on monitors views.')
    }

    const missingPermission = describeMissingPermission(view, payload)
    if (missingPermission) {
      this.style.longError('Failed to update view.', missingPermission)
      process.exitCode = 1
      return
    }

    await this.confirmOrAbort({
      command: 'ui-views update',
      description: 'Update saved view',
      changes: [
        `Update view "${view.name}" (${view.id}) on the ${toViewPageOption(view.page)} page`,
        ...describeChanges(view, payload),
      ],
      flags,
      flagMetadata: metadata.flags,
      args: { id: args.id },
      classification: {
        readOnly: UiViewsUpdate.readOnly,
        destructive: UiViewsUpdate.destructive,
        idempotent: UiViewsUpdate.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const updated = await api.views.update(args.id, payload)

      if (flags.output === 'json') {
        this.log(JSON.stringify(updated, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatViewDetail(updated, fmt))
        return
      }

      this.style.shortSuccess(`View "${updated.name}" updated.`)
      const output: string[] = []
      output.push(formatViewDetail(updated, fmt))
      output.push('')
      output.push(renderCommandHints([
        { label: 'Back to list', command: `checkly ui-views list --page ${toViewPageOption(updated.page)}` },
      ]))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to update view.', describeViewError(err) ?? err)
      process.exitCode = 1
    }
  }
}

/** The visibility the update moves the view to, or undefined when it keeps its current one. */
function visibilityChange (view: View, payload: UpdateViewPayload): ViewVisibility | undefined {
  return payload.visibility !== view.visibility ? payload.visibility : undefined
}

function describeMissingPermission (view: View, payload: UpdateViewPayload): string | undefined {
  const editsContent = payload.name !== undefined || payload.filters !== undefined || payload.counter !== undefined
  if (editsContent && !view.canUpdate) {
    return 'Editing shared views requires the views:update permission'
  }

  const visibility = visibilityChange(view, payload)
  if (visibility !== undefined && !view.canShare) {
    return visibility === 'ACCOUNT'
      ? 'Sharing views requires the views:share permission'
      : 'Making shared views private requires the views:delete permission'
  }

  return undefined
}

function describeChanges (view: View, payload: UpdateViewPayload): string[] {
  const changes: string[] = []
  if (payload.name !== undefined) {
    changes.push(`Rename to "${payload.name}"`)
  }
  if (payload.filters !== undefined) {
    changes.push(`Replace filters with ${JSON.stringify(payload.filters)}`)
  }
  if (payload.counter !== undefined) {
    changes.push(payload.counter === null ? 'Remove the counter' : `Set the counter to ${payload.counter}`)
  }
  const visibility = visibilityChange(view, payload)
  if (visibility === 'ACCOUNT') {
    changes.push('Share with everyone on the account')
  } else if (visibility === 'PRIVATE') {
    const owner = view.createdBy?.isMember ? view.createdBy.name : 'you'
    changes.push(`Make private: only ${owner} will see it, and it is removed for everyone else on the account`)
  }
  return changes
}
