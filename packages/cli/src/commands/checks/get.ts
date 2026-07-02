import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import type { CheckWithStatus } from '../../formatters/checks.js'
import {
  type OutputFormat,
  type CommandHint,
  stripAnsi,
  formatDate,
  renderCommandHints,
} from '../../formatters/render.js'
import {
  formatCheckDetail,
  formatResults,
  formatErrorGroups,
} from '../../formatters/checks.js'
import {
  formatResultDetailWithNavigation,
  formatAttemptsSection,
  groupAttemptsBySequence,
} from '../../formatters/check-result-detail.js'
import type { CheckResult, CheckResultField, ListCheckResultsParams } from '../../rest/check-results.js'
import { formatRcaDetail, formatRcaHint, transformErrorGroupForJson } from '../../formatters/rca.js'
import { quickRangeValues, type QuickRange, type GroupBy } from '../../rest/analytics.js'
import { formatAnalyticsSection } from '../../formatters/analytics.js'

// Internal, fixed projection for the embedded recent-results table. These are
// exactly the fields formatResults() and resolveResultStatus() read; requesting
// the wide result bodies (apiCheckResult, browserCheckResult, metadata, assets,
// …) would make the backend select and decorate payloads this view never
// renders. This is intentionally not a user-facing flag: `checks get` aggregates
// check details, status, analytics, error groups, and results, so a generic
// `--fields` would be ambiguous.
const RECENT_RESULTS_FIELDS: CheckResultField[] = [
  'id', 'startedAt', 'runLocation', 'hasErrors', 'hasFailures', 'isDegraded', 'responseTime',
]

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
    'include-attempts': Flags.boolean({
      description: 'Show individual retry attempts for the result (use with --result).',
      dependsOn: ['result'],
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
    'stats-range': Flags.string({
      description: 'Time range for stats.',
      options: quickRangeValues,
      default: 'last24Hours',
    }),
    'group-by': Flags.string({
      description: 'Group stats by dimension.',
      options: ['location', 'statusCode'],
    }),
    'metrics': Flags.string({
      description: 'Comma-separated list of metrics to show (overrides defaults).',
    }),
    'filter-status': Flags.string({
      description: 'Only include runs with this status in stats.',
      options: ['success', 'failure'],
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(ChecksGet)
    this.style.outputFormat = flags.output

    try {
      // Result detail mode: drill into a specific result
      if (flags.result) {
        return await this.showResultDetail(args.id, flags.result, flags.output ?? 'detail', flags['include-attempts'])
      }

      // Error group detail mode
      if (flags['error-group']) {
        return await this.showErrorGroupDetail(args.id, flags['error-group'], flags.output ?? 'detail')
      }

      // Fetch check first (need checkType for analytics)
      const { data: check } = await api.checks.get(args.id)

      // The recent-results table only needs a narrow column set, so project to
      // those fields and let the backend skip wide result payloads. JSON output
      // is the exception: it exposes full `results` entries, so we omit `fields`
      // there to preserve backwards compatibility for existing consumers.
      const resultsParams: ListCheckResultsParams = {
        limit: flags['results-limit'],
        nextId: flags['results-cursor'],
      }
      if (flags.output !== 'json') {
        resultsParams.fields = RECENT_RESULTS_FIELDS
      }

      // Fetch remaining data in parallel
      const [statusResp, resultsResp, errorGroupsResp, analyticsResp] = await Promise.all([
        api.checkStatuses.get(args.id).catch(() => ({ data: undefined })),
        api.checkResults.getAll(args.id, resultsParams)
          .catch(() => ({ data: { entries: [], nextId: null, length: 0 } })),
        api.errorGroups.getByCheckId(args.id).catch(() => ({ data: [] })),
        api.analytics.get(args.id, check.checkType, {
          quickRange: (flags['stats-range'] ?? 'last24Hours') as QuickRange,
          groupBy: flags['group-by'] === 'location' ? 'runLocation' : flags['group-by'] as GroupBy | undefined,
          metrics: flags.metrics ? flags.metrics.split(',').map(m => m.trim()) : undefined,
          filterByStatus: flags['filter-status'] as 'success' | 'failure' | undefined,
        }).then(r => r.data).catch(() => undefined),
      ])

      const status = statusResp.data
      const { entries: results, nextId } = resultsResp.data
      const errorGroups = errorGroupsResp.data

      if (flags.output === 'json') {
        const analytics = analyticsResp ?? null
        const errorGroupsJson = errorGroups.map(transformErrorGroupForJson)
        this.log(JSON.stringify({ check, status, results, nextId, errorGroups: errorGroupsJson, analytics }, null, 2))
        return
      }

      const checkWithStatus: CheckWithStatus = { ...check, status }
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        const lines = [
          formatCheckDetail(checkWithStatus, fmt),
        ]
        const statsOutput = formatAnalyticsSection(analyticsResp, flags['stats-range'] ?? 'last24Hours', fmt)
        if (statsOutput) {
          lines.push('')
          lines.push(statsOutput)
        }
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

      const statsOutput = formatAnalyticsSection(analyticsResp, flags['stats-range'] ?? 'last24Hours', fmt)
      if (statsOutput) {
        output.push(statsOutput)
        output.push('')
      }

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
      const hints: CommandHint[] = []
      if (errorGroups.length > 0) {
        const firstActive = errorGroups.find(eg => !eg.archivedUntilNextEvent)
        if (firstActive) {
          hints.push({ label: 'View error', command: `checkly checks get ${args.id} --error-group ${firstActive.id}` })
        }
      }
      if (results.length > 0) {
        hints.push({ label: 'View result', command: `checkly checks get ${args.id} --result ${results[0].id}` })
      }
      if (nextId) {
        hints.push({ label: 'More results', command: `checkly checks get ${args.id} --results-cursor ${nextId}` })
      }
      hints.push({ label: 'Change range', command: `checkly checks get ${args.id} --stats-range last7Days` })
      hints.push({ label: 'By region', command: `checkly checks get ${args.id} --group-by location` })
      hints.push({ label: 'Back to list', command: 'checkly checks list' })
      output.push(renderCommandHints(hints, { gap: 3 }))

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
      this.log(JSON.stringify(transformErrorGroupForJson(errorGroup), null, 2))
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
      const rcasMd = errorGroup.rootCauseAnalyses ?? []
      if (rcasMd.length > 0) {
        lines.push('', formatRcaDetail(rcasMd[0], fmt))
        const hintMd = formatRcaHint(rcasMd.length, fmt)
        if (hintMd) lines.push('', hintMd)
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

    const rcas = errorGroup.rootCauseAnalyses ?? []
    if (rcas.length > 0) {
      output.push('')
      output.push(formatRcaDetail(rcas[0], fmt))
      const hint = formatRcaHint(rcas.length, fmt)
      if (hint) output.push('', hint)
    }

    output.push('')
    output.push(renderCommandHints([
      { label: 'Back to check', command: `checkly checks get ${checkId}` },
      { label: 'Back to list', command: 'checkly checks list' },
    ]))

    this.log(output.join('\n'))
  }

  private async showResultDetail (
    checkId: string,
    resultId: string,
    outputFormat: string,
    includeAttempts: boolean,
  ): Promise<void> {
    const { data: result } = await api.checkResults.get(checkId, resultId)

    const attempts = includeAttempts && result.sequenceId
      ? await this.fetchAttempts(checkId, result)
      : []

    if (outputFormat === 'json') {
      this.log(JSON.stringify(includeAttempts ? { result, attempts } : result, null, 2))
      return
    }

    const fmt: OutputFormat = outputFormat === 'md' ? 'md' : 'terminal'

    const sections: string[] = []
    if (includeAttempts) {
      sections.push(this.renderAttemptsSection(attempts, resultId, fmt))
    } else {
      const note = this.retryContextNote(result)
      if (note) {
        sections.push(fmt === 'md' ? `_${note}_` : chalk.dim(note))
      }
    }

    const hints: CommandHint[] = []
    // Suggest the full sequence for an attempt (always part of a retried run) or a
    // final that was retried (`attempts` is 1-based, so > 1 means it retried).
    if (!includeAttempts && (result.resultType === 'ATTEMPT' || (result.attempts ?? 1) > 1)) {
      hints.push({
        label: 'Show attempts',
        command: `checkly checks get ${checkId} --result ${resultId} --include-attempts`,
      })
    }
    if (includeAttempts) {
      const otherAttempts = attempts.filter(a => a.resultType === 'ATTEMPT' && a.id !== resultId)
      if (result.resultType === 'ATTEMPT') {
        // Viewing an attempt: jump to the final, and (if any) to the other
        // attempts via a generic placeholder (their IDs are listed in the table).
        const final = attempts.find(a => a.resultType === 'FINAL')
        if (final) {
          hints.push({ label: 'Show final result', command: `checkly checks get ${checkId} --result ${final.id}` })
        }
        if (otherAttempts.length > 0) {
          hints.push({ label: 'View attempt', command: `checkly checks get ${checkId} --result <result-id>` })
        }
      } else if (otherAttempts.length > 0) {
        // Viewing the final: link to the lone attempt directly, else a placeholder.
        const target = otherAttempts.length === 1 ? otherAttempts[0].id : '<result-id>'
        hints.push({ label: 'View attempt', command: `checkly checks get ${checkId} --result ${target}` })
      }
    }
    hints.push({ label: 'Back to check', command: `checkly checks get ${checkId}` })
    hints.push({ label: 'Back to list', command: 'checkly checks list' })

    this.log(formatResultDetailWithNavigation(result, fmt, hints, sections))
  }

  // Plain (non --include-attempts) note giving retry context: that an attempt
  // isn't the final result, or that a final masks earlier failed attempts.
  private retryContextNote (result: CheckResult): string | undefined {
    if (result.resultType === 'ATTEMPT') {
      return 'Note: this is an intermediate retry attempt, not the run\'s final result. '
        + 'To view the full sequence including the final result, retrieve all attempts.'
    }
    const retries = (result.attempts ?? 1) - 1
    if (retries > 0) {
      return `Note: this run was retried ${retries} time${retries === 1 ? '' : 's'} before this final result. `
        + 'Retrieve all attempts to inspect them.'
    }
    return undefined
  }

  private renderAttemptsSection (attempts: CheckResult[], resultId: string, fmt: OutputFormat): string {
    // Decide off the actual ATTEMPT rows, not the `attempts` counter (which is
    // 1-based, so it can't reliably tell "ran once" from "retried").
    if (attempts.some(a => a.resultType === 'ATTEMPT')) {
      return formatAttemptsSection(attempts, fmt, {
        finalId: attempts.find(a => a.resultType === 'FINAL')?.id,
        requestedId: resultId,
      })
    }

    const msg = 'Ran once, no retry attempts.'
    return fmt === 'md' ? `_${msg}_` : chalk.dim(msg)
  }

  // The longest a retry sequence can span end to end: the backend caps total
  // retry time at FALLBACK_MAX_DURATION_SECONDS (10 min) and a single backoff at
  // MAX_BACKOFF_SECONDS (15 min). Querying ±this around any one member is
  // therefore guaranteed to cover the whole sequence — it can't clip it.
  private static readonly MAX_SEQUENCE_SPAN_SECONDS = 30 * 60

  // Runaway guard only: with limit 100 over the span window this is never reached
  // for real checks (it would take >25 results/sec), so it never truncates a
  // sequence — it just bounds a pathological loop.
  private static readonly MAX_RESULT_PAGES = 15

  // Collects every result in the drilled-into result's retry sequence and groups
  // them locally (the list endpoint has no server-side sequenceId filter).
  //
  // We query a span-sized window centred on the result and page through it
  // (newest-first). The window is centred rather than one-sided because the
  // result may be the final run or any earlier attempt, and anchoring on its
  // timestamp keeps this O(1) page even for old results (no scanning back from
  // now). See MAX_SEQUENCE_SPAN_SECONDS for why the window can't clip a sequence.
  private async fetchAttempts (checkId: string, result: CheckResult): Promise<CheckResult[]> {
    if (!result.sequenceId) {
      return []
    }

    const anchorSeconds = Math.floor(new Date(result.startedAt).getTime() / 1000)
    const window = {
      resultType: 'ALL' as const,
      from: anchorSeconds - ChecksGet.MAX_SEQUENCE_SPAN_SECONDS,
      to: anchorSeconds + ChecksGet.MAX_SEQUENCE_SPAN_SECONDS,
      limit: 100,
    }

    const collected: CheckResult[] = []
    let cursor: string | undefined
    for (let page = 0; page < ChecksGet.MAX_RESULT_PAGES; page++) {
      const resp = await api.checkResults.getAll(checkId, { ...window, nextId: cursor })
      collected.push(...resp.data.entries)
      cursor = resp.data.nextId ?? undefined
      if (!cursor) {
        break
      }
    }

    return groupAttemptsBySequence(collected, result.sequenceId)
  }
}
