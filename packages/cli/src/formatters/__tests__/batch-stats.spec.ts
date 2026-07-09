import { describe, it, expect } from 'vitest'
import { formatBatchStats, type StatsRow } from '../batch-stats.js'

// Build a minimal StatsRow. Only the fields read by the batch-stats formatter
// (name, checkType, activated, status, analytics) matter here.
function row (
  checkType: string,
  analytics: Partial<StatsRow['analytics']> = {},
  name = `${checkType} check`,
): StatsRow {
  return {
    name,
    checkType,
    activated: true,
    status: { hasFailures: false, hasErrors: false, isDegraded: false },
    analytics: { availability: 99.9, ...analytics },
  } as unknown as StatsRow
}

describe('formatBatchStats — TRACEROUTE columns', () => {
  it('renders a Hops column with the average hop count for TRACEROUTE rows', () => {
    const out = formatBatchStats([row('TRACEROUTE', { hopCount_avg: 12.5 })], 'last24Hours', 'md')

    expect(out).toContain('Hops (avg)')
    expect(out).toContain('12.50')
  })

  it('keeps the final-hop-latency responseTime columns for TRACEROUTE (no regression)', () => {
    // responseTime_avg for TRACEROUTE is the final-hop latency (ms).
    const out = formatBatchStats(
      [row('TRACEROUTE', { hopCount_avg: 9, responseTime_avg: 42000 })],
      'last24Hours',
      'md',
    )

    expect(out).toContain('Resp (avg)')
    expect(out).toContain('42.000s')
    expect(out).toContain('Hops (avg)')
  })

  it('shows a dash in the Hops column for non-TRACEROUTE rows in a mixed batch', () => {
    const out = formatBatchStats(
      [
        row('API', { responseTime_avg: 1000 }),
        row('TRACEROUTE', { hopCount_avg: 15 }),
      ],
      'last24Hours',
      'md',
    )

    expect(out).toContain('Hops (avg)')
    // The API row has no hop count; the Hops cell falls back to the dash.
    expect(out).toContain('—')
    expect(out).toContain('15.00')
  })

  it('omits the Hops column entirely when no TRACEROUTE checks are present', () => {
    const out = formatBatchStats([row('API', { responseTime_avg: 1000 })], 'last24Hours', 'md')

    expect(out).not.toContain('Hops')
  })

  it('renders a dash when a TRACEROUTE row has no hop-count data yet', () => {
    // Until the backend batch-analytics endpoint returns hopCount_avg, the column
    // renders a dash rather than a bogus value.
    const out = formatBatchStats([row('TRACEROUTE', { hopCount_avg: null })], 'last24Hours', 'md')

    expect(out).toContain('Hops (avg)')
    expect(out).toContain('—')
  })

  it('renders the Hops column in terminal format (count for traceroute, dash otherwise)', () => {
    const out = formatBatchStats(
      [
        row('API', { responseTime_avg: 1000 }),
        row('TRACEROUTE', { hopCount_avg: 15 }),
      ],
      'last24Hours',
      'terminal',
    )

    // Terminal renders headers upper-cased ("HOPS"); the value and the
    // non-traceroute dash both survive chalk styling.
    expect(out).toContain('HOPS')
    expect(out).toContain('15.00')
    expect(out).toContain('—')
  })
})
