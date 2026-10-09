import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../formatters/render.js'
import { formatViewDetail } from '../../formatters/views.js'
import type { ViewFilters } from '../../rest/views.js'
import {
  describeViewError,
  normalizeViewCounter,
  normalizeViewPage,
  parseViewFilters,
  toViewPageOption,
  viewCounterOptions,
  viewPageOptions,
} from '../../helpers/views.js'

export default class UiViewsCreate extends AuthCommand {
  static hidden = false
  static description = 'Create a private saved view.\n'
    + 'Share it afterwards with `checkly ui-views update <id> --share`.'

  static examples = [
    'checkly ui-views create --page monitors --name "Failing production" '
    + '--filters \'{"status":["failing"],"tags":["production"]}\' --counter failing',
    'checkly ui-views create --page test-sessions --name "Main branch" --filters \'{"branches":["main"]}\'',
  ]

  static flags = {
    'page': Flags.string({
      description: `Page the view belongs to: ${viewPageOptions.join(', ')}.`,
      required: true,
    }),
    'name': Flags.string({
      description: 'View name (1-200 characters).',
      required: true,
    }),
    'filters': Flags.string({
      description: 'View filters as a JSON object, e.g. \'{"tags":["production"]}\'. '
        + 'Run `checkly skills manage ui-views` for the filters each page accepts.',
      required: true,
    }),
    'counter': Flags.string({
      description: `Count shown on the view tab: ${viewCounterOptions.join(', ')}. Monitors views only.`,
    }),
    'output': outputFlag({ default: 'table' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { flags, metadata } = await this.parse(UiViewsCreate)
    this.style.outputFormat = flags.output

    const page = normalizeViewPage(flags.page)
    if (!page) {
      this.error(`Invalid --page "${flags.page}". Valid values: ${viewPageOptions.join(', ')}.`)
    }

    let filters: ViewFilters
    try {
      filters = parseViewFilters(flags.filters)
    } catch (err: any) {
      this.error(err.message)
    }

    const counter = normalizeViewCounter(flags.counter)
    if (flags.counter !== undefined && !counter) {
      this.error(`Invalid --counter "${flags.counter}". Valid values: ${viewCounterOptions.join(', ')}.`)
    }
    if (counter && page !== 'monitors') {
      this.error('--counter is only supported on monitors views.')
    }

    const pageOption = toViewPageOption(page)

    await this.confirmOrAbort({
      command: 'ui-views create',
      description: 'Create saved view',
      changes: [
        `Create private view "${flags.name}" on the ${pageOption} page`,
        `Filters: ${JSON.stringify(filters)}`,
        `Counter: ${counter ?? 'none'}`,
      ],
      flags,
      flagMetadata: metadata.flags,
      classification: {
        readOnly: UiViewsCreate.readOnly,
        destructive: UiViewsCreate.destructive,
        idempotent: UiViewsCreate.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const view = await api.views.create({ page, name: flags.name, filters, counter })

      if (flags.output === 'json') {
        this.log(JSON.stringify(view, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatViewDetail(view, fmt))
        return
      }

      this.style.shortSuccess(`View "${view.name}" created.`)
      const output: string[] = []
      output.push(formatViewDetail(view, fmt))
      output.push('')
      output.push(renderCommandHints([
        ...(view.canShare ? [{ label: 'Share', command: `checkly ui-views update ${view.id} --share` }] : []),
        { label: 'List', command: `checkly ui-views list --page ${pageOption}` },
      ]))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to create view.', describeViewError(err) ?? err)
      process.exitCode = 1
    }
  }
}
