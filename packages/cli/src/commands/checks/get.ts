import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import * as api from '../../rest/api'
import type { CheckWithStatus } from '../../formatters/checks'
import type { OutputFormat } from '../../formatters/render'
import {
  formatCheckDetail,
  formatResults,
  formatErrorGroups,
} from '../../formatters/checks'
import { formatResultDetail } from '../../formatters/check-result-detail'

export default class ChecksGet extends AuthCommand {
  static hidden = false
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
    'output': Flags.string({
      char: 'o',
      description: 'Output format.',
      options: ['detail', 'json', 'md'],
      default: 'detail',
    }),
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
      this.exit(1)
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

    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\u001B\[[0-9;]*m/g
    const cleanMsg = errorGroup.cleanedErrorMessage
      .replace(ansiRegex, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Show full raw message if available and different from cleaned
    const rawMsg = errorGroup.rawErrorMessage
      ? errorGroup.rawErrorMessage.replace(ansiRegex, '').trim()
      : null

    const output: string[] = []

    output.push(chalk.bold('ERROR GROUP'))
    output.push('')
    output.push(chalk.red(cleanMsg))

    if (rawMsg && rawMsg !== cleanMsg) {
      output.push('')
      output.push(chalk.bold('FULL ERROR'))
      // Show the raw message with original newlines preserved
      const fullMsg = errorGroup.rawErrorMessage!.replace(ansiRegex, '').trim()
      output.push(fullMsg)
    }

    output.push('')
    output.push(`${chalk.dim('First seen:')}    ${new Date(errorGroup.firstSeen).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`)
    output.push(`${chalk.dim('Last seen:')}     ${new Date(errorGroup.lastSeen).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`)
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
