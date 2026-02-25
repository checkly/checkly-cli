import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import {
  formatStatusPages,
  formatStatusPageTree,
  formatCursorPaginationInfo,
  formatCursorNavigationHints,
} from '../../formatters/status-pages'

const TREE_THRESHOLD = 5

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
      description: 'Hide card/service tree in table output.',
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
        this.log(formatStatusPages(entries, fmt))
        return
      }

      // Table output
      const output: string[] = []

      const showTree = !flags.compact && entries.length <= TREE_THRESHOLD

      if (showTree) {
        // Interleave table rows with trees: render one-row table per page + tree
        for (let i = 0; i < entries.length; i++) {
          const sp = entries[i]
          if (i === 0) {
            // First page: include header
            output.push(formatStatusPages([sp], fmt))
          } else {
            // Subsequent pages: just the data row (skip header)
            const fullTable = formatStatusPages([sp], fmt)
            const lines = fullTable.split('\n')
            output.push(lines.slice(1).join('\n'))
          }
          const tree = formatStatusPageTree(sp)
          if (tree) {
            output.push('')
            output.push(tree)
            output.push('')
          }
        }
      } else {
        output.push(formatStatusPages(entries, fmt))
      }

      output.push('')
      output.push(formatCursorPaginationInfo(length, nextId))

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
