import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../formatters/render.js'
import { formatViewsCount, formatViewsList } from '../../formatters/views.js'
import {
  describeViewError,
  normalizeViewPage,
  normalizeViewVisibility,
  viewPageOptions,
  viewVisibilityOptions,
} from '../../helpers/views.js'

export default class UiViewsList extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List the saved views of the Monitors and Test sessions pages.'

  static examples = [
    'checkly ui-views list',
    'checkly ui-views list --page monitors',
    'checkly ui-views list --page test-sessions --visibility account --output json',
  ]

  static flags = {
    page: Flags.string({
      description: `Only list views of this page: ${viewPageOptions.join(', ')}.`,
    }),
    visibility: Flags.string({
      description: `Only list views with this visibility: ${viewVisibilityOptions.join(', ')}.`,
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(UiViewsList)
    this.style.outputFormat = flags.output

    const page = normalizeViewPage(flags.page)
    if (flags.page && !page) {
      this.error(`Invalid --page "${flags.page}". Valid values: ${viewPageOptions.join(', ')}.`)
    }

    const visibility = normalizeViewVisibility(flags.visibility)
    if (flags.visibility && !visibility) {
      this.error(`Invalid --visibility "${flags.visibility}". Valid values: ${viewVisibilityOptions.join(', ')}.`)
    }

    try {
      const views = await api.views.getAll({ page, visibility })

      if (flags.output === 'json') {
        this.log(JSON.stringify({ data: views }, null, 2))
        return
      }

      if (views.length === 0) {
        this.log('No views found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatViewsList(views, fmt))
        return
      }

      const output: string[] = []
      output.push(formatViewsList(views, fmt))
      output.push('')
      output.push(formatViewsCount(views.length))
      output.push('')
      output.push(renderCommandHints([
        { label: 'Details', command: 'checkly ui-views get <id>' },
      ], { gap: 4 }))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list views.', describeViewError(err) ?? err)
      process.exitCode = 1
    }
  }
}
