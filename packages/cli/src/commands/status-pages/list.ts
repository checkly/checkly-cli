import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import {
  formatStatusPagesExpanded,
  formatStatusPagesCompact,
  formatCursorPaginationInfo,
  formatCursorNavigationHints,
} from '../../formatters/status-pages'

export default class StatusPagesList extends AuthCommand {
  static hidden = false
  static description = 'List all status pages in your account.'

  static flags = {
    limit: Flags.integer({
      char: 'l',
      description: 'Number of status pages to return (1-100).',
      default: 25,
    }),
    cursor: Flags.string({
      description: 'Cursor for next page (from previous output).',
    }),
    compact: Flags.boolean({
      description: 'Show one row per status page instead of per service.',
      default: false,
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(StatusPagesList)
    this.style.outputFormat = flags.output

    try {
      const result = await api.statusPages.getAll({
        limit: flags.limit,
        nextId: flags.cursor,
      })

      const { entries, nextId, length } = result

      // JSON output
      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: entries,
          pagination: { nextId, length },
        }, null, 2))
        return
      }

      if (length === 0) {
        this.log('No status pages found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      // Markdown output
      if (fmt === 'md') {
        this.log(flags.compact
          ? formatStatusPagesCompact(entries, fmt)
          : formatStatusPagesExpanded(entries, fmt))
        return
      }

      // Table output
      const output: string[] = []

      if (flags.compact) {
        output.push(formatStatusPagesCompact(entries, fmt))
      } else {
        output.push(formatStatusPagesExpanded(entries, fmt))
      }

      output.push('')
      output.push(formatCursorPaginationInfo(length, nextId))

      if (!flags.compact) {
        output.push('')
        output.push('Hint: use --compact for one row per status page.')
      }

      const navHints = formatCursorNavigationHints(nextId)
      if (navHints) {
        output.push('')
        output.push(navHints)
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list status pages.', err)
      process.exitCode = 1
    }
  }
}
