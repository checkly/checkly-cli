import chalk from 'chalk'
import type { SpendingLimit, SpendingLimitState } from '../rest/spending-limit.js'
import { type DetailField, type OutputFormat, formatDate, renderDetailFields } from './render.js'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Cents (possibly fractional, e.g. overage) as dollars: `1806.25` → `$18.06`. */
export function formatDollars (cents: number): string {
  return usd.format(cents / 100)
}

const STATE_LABELS: Record<SpendingLimitState, string> = {
  UNDER: 'Under the limit',
  CLOSE: 'Close to the limit',
  REACHED: 'Limit reached',
}

function color (format: OutputFormat, paint: (s: string) => string, value: string) {
  return format === 'terminal' ? paint(value) : value
}

const fields: DetailField<SpendingLimit>[] = [
  {
    label: 'Spending limit',
    value: ({ spendingCapCents: cap }) => {
      if (cap === null) return 'No limit'
      return cap === 0 ? `${formatDollars(0)} (no overage allowed)` : formatDollars(cap)
    },
  },
  {
    label: 'Overage so far',
    value: ({ standing }) => standing
      ? formatDollars(standing.overageCents)
      : 'Not measured (runs not measured yet, or no overage on this plan)',
  },
  {
    label: 'Status',
    value: ({ standing }, format) => {
      const limit = standing?.limit
      if (!limit) return null
      const label = STATE_LABELS[limit.state] ?? limit.state
      if (limit.state === 'CLOSE') {
        return color(format, chalk.yellow, `${label} (from ${formatDollars(limit.closeAtCents)})`)
      }
      return limit.state === 'REACHED' ? color(format, chalk.red, label) : label
    },
  },
  {
    label: 'Checks stopped',
    value: ({ standing }, format) => {
      if (!standing) return null
      return standing.limit?.state === 'REACHED'
        ? color(format, chalk.red, 'Yes, the spending limit is reached')
        : 'No'
    },
  },
  {
    label: 'Measured at',
    value: ({ standing }, format) => standing ? formatDate(standing.measuredAt, format) : null,
  },
]

export function formatSpendingLimit (data: SpendingLimit, format: OutputFormat): string {
  return renderDetailFields('Spending limit', fields, data, format)
}
