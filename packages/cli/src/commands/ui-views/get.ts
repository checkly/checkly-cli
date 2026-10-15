import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../formatters/render.js'
import { formatViewDetail } from '../../formatters/views.js'
import { describeViewError, toViewPageOption } from '../../helpers/views.js'

export default class UiViewsGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Get details of a saved view, including its filters.'

  static examples = [
    'checkly ui-views get <id>',
    'checkly ui-views get <id> --output json',
  ]

  static args = {
    id: Args.string({
      description: 'The ID of the view to retrieve.',
      required: true,
    }),
  }

  static flags = {
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(UiViewsGet)
    this.style.outputFormat = flags.output

    try {
      const view = await api.views.get(args.id)

      if (flags.output === 'json') {
        this.log(JSON.stringify(view, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatViewDetail(view, fmt))
        return
      }

      const output: string[] = []
      output.push(formatViewDetail(view, fmt))
      output.push('')
      output.push(renderCommandHints([
        { label: 'Back to list', command: `checkly ui-views list --page ${toViewPageOption(view.page)}` },
      ]))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to get view details.', describeViewError(err) ?? err)
      process.exitCode = 1
    }
  }
}
