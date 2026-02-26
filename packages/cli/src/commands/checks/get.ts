import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { CheckWithStatus } from '../../formatters/checks'
import { type OutputFormat, stripAnsi, formatDate } from '../../formatters/render'
import {
  formatCheckDetail,
  formatResults,
  formatErrorGroups,
} from '../../formatters/checks'
import { formatResultDetail } from '../../formatters/check-result-detail'

export default class ChecksGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Get details of a specific check, including recent results. Use --result to drill into a specific result.'

  static args = {
    id: Args.string({
      description: 'The ID of the check to retrieve.',
      required: true,
    }),
  }

  static flags = {
    'result': Flags.string({
      char: 'r',
      description: 'Show details for a specific result ID.',
    }),
    'error-group': Flags.string({
      char: 'e',
      description: 'Show full details for a specific error group ID.',
    }),
    'results-limit': Flags.integer({
      description: 'Number of recent results to show.',
      default: 10,
    }),
    'results-cursor': Flags.string({
      description: 'Cursor for results pagination (from previous output).',
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(ChecksGet)
    this.style.outputFormat = flags.output

    try {
      // Result detail mode: drill into a specific result
      if (flags.result) {
        return await this.showResultDetail(args.id, flags.result, flags.output ?? 'detail')
      }

      // Error group detail mode
      if (flags['error-group']) {
        return await this.showErrorGroupDetail(args.id, flags['error-group'], flags.output ?? 'detail')
      }

      const [{ data: check }, statusResp, resultsResp, errorGroupsResp] = await Promise.all([
        api.checks.get(args.id),
        api.checkStatuses.get(args.id).catch(() => ({ data: undefined })),
        api.checkResults.getAll(args.id, {
          limit: flags['results-limit'],
          nextId: flags['results-cursor'],
        }).catch(() => ({ data: { entries: [], nextId: null, length: 0 } })),
        api.errorGroups.getByCheckId(args.id).catch(() => ({ data: [] })),
      ])

      const status = statusResp.data
      const { entries: results, nextId } = resultsResp.data
      const errorGroups = errorGroupsResp.data

      if (flags.output === 'json') {
        this.log(JSON.stringify({ check, status, results, nextId, errorGroups }, null, 2))
        return
      }

      const checkWithStatus: CheckWithStatus = { ...check, status }
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        const lines = [
          formatCheckDetail(checkWithStatus, fmt),
        ]
        const errorGroupsOutput = formatErrorGroups(errorGroups, fmt)
        if (errorGroupsOutput) {
          lines.push('')
          lines.push(errorGroupsOutput)
        }
        if (results.length > 0) {
          lines.push('')
          lines.push('## Recent Results')
          lines.push('')
          lines.push(formatResults(results, fmt))
        }
        this.log(lines.join('\n'))
        return
      }

      // Detail output
      const output: string[] = []

      output.push(formatCheckDetail(checkWithStatus, fmt))
      output.push('')

      const errorGroupsOutput = formatErrorGroups(errorGroups, fmt)
      if (errorGroupsOutput) {
        output.push(errorGroupsOutput)
        output.push('')
      }

      if (results.length > 0) {
        output.push(chalk.bold('RECENT RESULTS'))
        output.push(formatResults(results, fmt))
      } else {
        output.push(chalk.dim('No recent results.'))
      }

      // Navigation hints
      output.push('')
      if (errorGroups.length > 0) {
        const firstActive = errorGroups.find(eg => !eg.archivedUntilNextEvent)
        if (firstActive) {
          output.push(`  ${chalk.dim('View error:')}     checkly checks get ${args.id} --error-group ${firstActive.id}`)
        }
      }
      if (results.length > 0) {
        output.push(`  ${chalk.dim('View result:')}    checkly checks get ${args.id} --result ${results[0].id}`)
      }
      if (nextId) {
        output.push(`  ${chalk.dim('More results:')}   checkly checks get ${args.id} --results-cursor ${nextId}`)
      }
      output.push(`  ${chalk.dim('Back to list:')}   checkly checks list`)

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to get check details.', err)
      process.exitCode = 1
    }
  }

  private async showErrorGroupDetail (checkId: string, errorGroupId: string, outputFormat: string): Promise<void> {
    const [{ data: errorGroup }, { data: check }] = await Promise.all([
      api.errorGroups.get(errorGroupId),
      api.checks.get(checkId),
    ])

    if (outputFormat === 'json') {
      this.log(JSON.stringify(errorGroup, null, 2))
      return
    }

    const fmt: OutputFormat = outputFormat === 'md' ? 'md' : 'terminal'

    const cleanMsg = stripAnsi(errorGroup.cleanedErrorMessage)
      .replace(/\s+/g, ' ')
      .trim()

    // Show full raw message if available and different from cleaned
    const rawMsg = errorGroup.rawErrorMessage
      ? stripAnsi(errorGroup.rawErrorMessage).trim()
      : null

    if (fmt === 'md') {
      const lines = [
        '# Error Group',
        '',
        `\`\`\`\n${cleanMsg}\n\`\`\``,
      ]
      if (rawMsg && rawMsg !== cleanMsg) {
        lines.push('', '## Full Error', '', `\`\`\`\n${stripAnsi(errorGroup.rawErrorMessage!).trim()}\n\`\`\``)
      }
      lines.push(
        '',
        `| Field | Value |`,
        `| --- | --- |`,
        `| First seen | ${formatDate(errorGroup.firstSeen, fmt)} |`,
        `| Last seen | ${formatDate(errorGroup.lastSeen, fmt)} |`,
        `| Error group | ${errorGroup.id} |`,
      )
      if (check.scriptPath) {
        lines.push(`| Source file | ${check.scriptPath} |`)
      }
      this.log(lines.join('\n'))
      return
    }

    const output: string[] = []

    output.push(chalk.bold('ERROR GROUP'))
    output.push('')
    output.push(chalk.red(cleanMsg))

    if (rawMsg && rawMsg !== cleanMsg) {
      output.push('')
      output.push(chalk.bold('FULL ERROR'))
      output.push(stripAnsi(errorGroup.rawErrorMessage!).trim())
    }

    output.push('')
    output.push(`${chalk.dim('First seen:')}    ${formatDate(errorGroup.firstSeen, fmt)}`)
    output.push(`${chalk.dim('Last seen:')}     ${formatDate(errorGroup.lastSeen, fmt)}`)
    output.push(`${chalk.dim('Error group:')}   ${errorGroup.id}`)

    if (check.scriptPath) {
      output.push(`${chalk.dim('Source file:')}   ${chalk.cyan(check.scriptPath)}`)
    }

    output.push('')
    output.push(`  ${chalk.dim('Back to check:')}  checkly checks get ${checkId}`)
    output.push(`  ${chalk.dim('Back to list:')}   checkly checks list`)

    this.log(output.join('\n'))
  }

  private async showResultDetail (checkId: string, resultId: string, outputFormat: string): Promise<void> {
    const { data: result } = await api.checkResults.get(checkId, resultId)

    if (outputFormat === 'json') {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const fmt: OutputFormat = outputFormat === 'md' ? 'md' : 'terminal'

    const output: string[] = []
    output.push(formatResultDetail(result, fmt))

    // Navigation hints
    output.push('')
    output.push(`  ${chalk.dim('Back to check:')}  checkly checks get ${checkId}`)
    output.push(`  ${chalk.dim('Back to list:')}   checkly checks list`)

    this.log(output.join('\n'))
  }
}
