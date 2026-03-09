import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import { quickRangeValues } from '../../rest/analytics'
import type { QuickRange, AnalyticsResponse } from '../../rest/analytics'
import type { OutputFormat } from '../../formatters/render'
import { renderDetailFields, type DetailField } from '../../formatters/render'
import { extractMetrics, formatMetricValue, formatMetricLabel } from '../../formatters/analytics'

interface StatsData {
  response: AnalyticsResponse
  metrics: Record<string, number | string>
}

export default class ChecksStats extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Show analytics stats for a specific check (availability, response times, etc.).'

  static args = {
    id: Args.string({
      description: 'The ID of the check.',
      required: true,
    }),
  }

  static flags = {
    'range': Flags.string({
      char: 'r',
      description: 'Time range for stats.',
      options: quickRangeValues,
      default: 'last24Hours',
    }),
    'metrics': Flags.string({
      char: 'm',
      description: 'Comma-separated list of metrics to fetch. Use --list-metrics to see available metrics for the check type.',
    }),
    'list-metrics': Flags.boolean({
      description: 'List available metrics for this check type and exit.',
      default: false,
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(ChecksStats)
    this.style.outputFormat = flags.output

    try {
      // Fetch the check to know its type
      const { data: check } = await api.checks.get(args.id)

      // List metrics mode
      if (flags['list-metrics']) {
        return await this.showAvailableMetrics(check.checkType, flags.output ?? 'detail')
      }

      const metrics = flags.metrics?.split(',').map(m => m.trim()).filter(Boolean)

      const response = await api.analytics.get(args.id, check.checkType, {
        quickRange: flags.range as QuickRange,
        metrics,
      })

      const statsData: StatsData = {
        response,
        metrics: extractMetrics(response),
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({
          checkId: response.checkId,
          name: response.name,
          checkType: response.checkType,
          from: response.from,
          to: response.to,
          quickRange: flags.range,
          metrics: statsData.metrics,
          metadata: response.metadata,
        }, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(this.formatStats(check.name, statsData, flags.range!, fmt))

      // Navigation hint
      if (fmt === 'terminal') {
        this.log('')
        this.log(`  ${chalk.dim('Available metrics:')}  checkly checks stats ${args.id} --list-metrics`)
        this.log(`  ${chalk.dim('Custom metrics:')}     checkly checks stats ${args.id} --metrics responseTime_avg,responseTime_p99`)
        this.log(`  ${chalk.dim('Change range:')}       checkly checks stats ${args.id} --range last7Days`)
        this.log(`  ${chalk.dim('View check:')}         checkly checks get ${args.id}`)
      }
    } catch (err: any) {
      this.style.longError('Failed to get check stats.', err)
      process.exitCode = 1
    }
  }

  private formatStats (checkName: string, stats: StatsData, range: string, format: OutputFormat): string {
    const { response, metrics } = stats

    const fields: DetailField<StatsData>[] = [
      {
        label: 'Period',
        value: (_s, fmt) => {
          const from = new Date(response.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const to = new Date(response.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const display = `${from} → ${to} (${range})`
          return fmt === 'terminal' ? chalk.dim(display) : display
        },
      },
    ]

    // Add a field for each metric
    const metricKeys = Object.keys(metrics)
    for (const key of metricKeys) {
      const value = metrics[key]
      if (typeof value !== 'number' || isNaN(value)) continue

      const label = formatMetricLabel(key)
      const metricValue = value
      fields.push({
        label,
        value: (_s, fmt) => formatMetricValue(key, metricValue, fmt),
      })
    }

    if (metricKeys.length === 0) {
      fields.push({
        label: 'Data',
        value: (_s, fmt) => fmt === 'terminal' ? chalk.dim('No data available for this period') : 'No data available',
      })
    }

    return renderDetailFields(checkName, fields, stats, format)
  }

  private async showAvailableMetrics (checkType: string, outputFormat: string): Promise<void> {
    const metrics = await api.analytics.listMetrics(checkType)

    if (outputFormat === 'json') {
      this.log(JSON.stringify(metrics, null, 2))
      return
    }

    const fmt: OutputFormat = outputFormat === 'md' ? 'md' : 'terminal'

    if (fmt === 'md') {
      const lines = [
        `# Available Metrics for ${checkType}`,
        '',
        '| Metric | Label | Unit | Aggregated |',
        '| --- | --- | --- | --- |',
        ...metrics.map(m => `| ${m.name} | ${m.label} | ${m.unit} | ${m.aggregated ? 'yes' : 'no'} |`),
      ]
      this.log(lines.join('\n'))
      return
    }

    this.log(chalk.bold(`Available metrics for ${checkType}`))
    this.log('')

    const aggregated = metrics.filter(m => m.aggregated)
    const nonAggregated = metrics.filter(m => !m.aggregated)

    if (aggregated.length > 0) {
      this.log(chalk.bold('Aggregated metrics') + chalk.dim(' (used for stats over a time range)'))
      for (const m of aggregated) {
        this.log(`  ${chalk.cyan(m.name.padEnd(30))} ${chalk.dim(m.label)} ${chalk.dim(`[${m.unit}]`)}`)
      }
      this.log('')
    }

    if (nonAggregated.length > 0) {
      this.log(chalk.bold('Per-result metrics') + chalk.dim(' (individual data points)'))
      for (const m of nonAggregated) {
        this.log(`  ${chalk.cyan(m.name.padEnd(30))} ${chalk.dim(m.label)} ${chalk.dim(`[${m.unit}]`)}`)
      }
    }
  }
}
