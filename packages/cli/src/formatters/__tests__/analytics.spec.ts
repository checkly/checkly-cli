import { describe, it, expect } from 'vitest'
import type { AnalyticsResponse, AnalyticsSeriesEntry } from '../../rest/analytics'
import {
  extractMetrics,
  findUnit,
  formatMetricValue,
  formatMetricLabel,
  formatAnalyticsSection,
} from '../analytics'
import { stripAnsi } from '../render'

const mockSeriesEntry: AnalyticsSeriesEntry = {
  data: {
    availability: 99.95,
    responseTime_avg: 245,
    responseTime_p50: 180,
    responseTime_p95: 890,
    responseTime_p99: 2400,
  },
}

const mockAnalyticsResponse: AnalyticsResponse = {
  checkId: 'check-1',
  name: 'My API Check',
  checkType: 'API',
  activated: true,
  muted: false,
  frequency: 10,
  from: '2026-03-08T00:00:00.000Z',
  to: '2026-03-09T00:00:00.000Z',
  tags: [],
  series: [mockSeriesEntry],
  metadata: {},
}

describe('extractMetrics', () => {
  it('extracts numeric values from series data', () => {
    const metrics = extractMetrics(mockSeriesEntry)
    expect(metrics).toEqual({
      availability: 99.95,
      responseTime_avg: 245,
      responseTime_p50: 180,
      responseTime_p95: 890,
      responseTime_p99: 2400,
    })
  })

  it('handles empty data', () => {
    expect(extractMetrics({ data: {} })).toEqual({})
  })

  it('handles array data (API format)', () => {
    const entry: AnalyticsSeriesEntry = {
      data: [{ availability: 99.5, responseTime_avg: 100 }],
    }
    expect(extractMetrics(entry)).toEqual({ availability: 99.5, responseTime_avg: 100 })
  })

  it('skips null and empty string values', () => {
    const entry: AnalyticsSeriesEntry = {
      data: { availability: null, responseTime_avg: '', valid: 42 },
    }
    expect(extractMetrics(entry)).toEqual({ valid: 42 })
  })

  it('parses string values as floats', () => {
    const entry: AnalyticsSeriesEntry = {
      data: { responseTime_avg: '245.5' },
    }
    expect(extractMetrics(entry)).toEqual({ responseTime_avg: 245.5 })
  })
})

describe('findUnit', () => {
  it('returns percentage for availability', () => {
    expect(findUnit('availability')).toBe('percentage')
  })

  it('returns percentage for packetLoss metrics', () => {
    expect(findUnit('packetLoss_avg')).toBe('percentage')
  })

  it('returns score for CLS metrics', () => {
    expect(findUnit('CLS_avg')).toBe('score')
  })

  it.each([
    'responseTime_avg',
    'total_avg',
    'latencyAvg_avg',
    'wait_avg',
    'dns_avg',
    'tcp_avg',
    'firstByte_avg',
    'download_avg',
    'connection_avg',
    'data_avg',
    'TTFB_avg',
    'FCP_avg',
    'LCP_avg',
    'TBT_avg',
  ])('returns ms for %s', key => {
    expect(findUnit(key)).toBe('ms')
  })

  it('returns empty string for unknown metrics', () => {
    expect(findUnit('unknownMetric')).toBe('')
  })

  it('prefers metadata unit when available', () => {
    const metadata: AnalyticsResponse['metadata'] = {
      customMetric: { label: 'Custom', unit: 'bytes' },
    }
    expect(findUnit('customMetric', metadata)).toBe('bytes')
  })

  it('falls back to base metric name in metadata', () => {
    const metadata: AnalyticsResponse['metadata'] = {
      responseTime: { label: 'Response Time', unit: 'ms' },
    }
    expect(findUnit('responseTime_p99', metadata)).toBe('ms')
  })
})

describe('formatMetricValue', () => {
  it('formats availability as percentage with color', () => {
    const result = formatMetricValue('availability', 99.95, 'terminal')
    expect(stripAnsi(result)).toBe('99.95%')
  })

  it('formats availability without color in md', () => {
    expect(formatMetricValue('availability', 99.95, 'md')).toBe('99.95%')
  })

  it('formats response time in ms', () => {
    const result = formatMetricValue('responseTime_avg', 245, 'terminal')
    expect(stripAnsi(result)).toBe('245ms')
  })

  it('formats response time over 1000ms as seconds', () => {
    const result = formatMetricValue('responseTime_p99', 2400, 'terminal')
    expect(stripAnsi(result)).toBe('2.40s')
  })

  it('formats packet loss as percentage', () => {
    const result = formatMetricValue('packetLoss_avg', 0.5, 'terminal')
    expect(stripAnsi(result)).toBe('0.50%')
  })

  it('formats latency as ms', () => {
    const result = formatMetricValue('latencyAvg_avg', 45, 'terminal')
    expect(stripAnsi(result)).toBe('45ms')
  })

  it('formats CLS as score', () => {
    const result = formatMetricValue('CLS_avg', 0.05, 'terminal')
    expect(stripAnsi(result)).toBe('0.050')
  })

  it('colors CLS based on threshold', () => {
    // Good: <= 0.1
    expect(stripAnsi(formatMetricValue('CLS_avg', 0.05, 'terminal'))).toBe('0.050')
    // Needs improvement: <= 0.25
    expect(stripAnsi(formatMetricValue('CLS_avg', 0.2, 'terminal'))).toBe('0.200')
    // Poor: > 0.25
    expect(stripAnsi(formatMetricValue('CLS_avg', 0.5, 'terminal'))).toBe('0.500')
  })

  it('formats CLS without color in md', () => {
    expect(formatMetricValue('CLS_avg', 0.05, 'md')).toBe('0.050')
  })

  it('formats generic numbers plainly', () => {
    const result = formatMetricValue('unknownMetric', 3.14159, 'terminal')
    expect(result).toBe('3.14')
  })

  it('uses metadata unit when provided', () => {
    const metadata: AnalyticsResponse['metadata'] = {
      customTiming: { label: 'Custom', unit: 'ms' },
    }
    const result = formatMetricValue('customTiming', 500, 'terminal', metadata)
    expect(stripAnsi(result)).toBe('500ms')
  })
})

describe('formatMetricLabel', () => {
  it('converts responseTime_avg to "Response Time (avg)"', () => {
    expect(formatMetricLabel('responseTime_avg')).toBe('Response Time (avg)')
  })

  it('converts responseTime_p99 to "Response Time (p99)"', () => {
    expect(formatMetricLabel('responseTime_p99')).toBe('Response Time (p99)')
  })

  it('handles single-word metric names', () => {
    expect(formatMetricLabel('availability')).toBe('Availability')
  })

  it('handles camelCase single words', () => {
    expect(formatMetricLabel('packetLoss')).toBe('Packet Loss')
  })

  it('handles Web Vitals naming', () => {
    expect(formatMetricLabel('LCP_avg')).toBe('LCP (avg)')
    expect(formatMetricLabel('CLS_avg')).toBe('CLS (avg)')
    expect(formatMetricLabel('TBT_avg')).toBe('TBT (avg)')
  })
})

describe('formatAnalyticsSection', () => {
  it('returns empty string for undefined input', () => {
    expect(formatAnalyticsSection(undefined, 'last24Hours', 'terminal')).toBe('')
  })

  it('returns empty string when no metrics are available', () => {
    const emptyResponse: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      series: [],
    }
    expect(formatAnalyticsSection(emptyResponse, 'last24Hours', 'terminal')).toBe('')
  })

  it('renders terminal section with title and metrics', () => {
    const result = formatAnalyticsSection(mockAnalyticsResponse, 'last24Hours', 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('STATS (last 24 hours)')
    expect(plain).toContain('Availability')
    expect(plain).toContain('99.95%')
    expect(plain).toContain('Response Time (avg)')
    expect(plain).toContain('245ms')
  })

  it('renders markdown section with header and table', () => {
    const result = formatAnalyticsSection(mockAnalyticsResponse, 'last7Days', 'md')
    expect(result).toContain('## Stats (last 7 days)')
    expect(result).toContain('| Metric | Value |')
    expect(result).toContain('| --- | --- |')
    expect(result).toContain('99.95%')
    expect(result).toContain('245ms')
  })

  it('renders grouped terminal output by location', () => {
    const grouped: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      requestedMetrics: ['availability', 'responseTime_avg'],
      series: [
        { data: { availability: 99.9, responseTime_avg: 120 }, runLocation: 'us-east-1' },
        { data: { availability: 99.5, responseTime_avg: 340 }, runLocation: 'ap-south-1' },
      ],
    }
    const result = formatAnalyticsSection(grouped, 'last24Hours', 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('us-east-1')
    expect(plain).toContain('ap-south-1')
    expect(plain).toContain('99.90%')
    expect(plain).toContain('120ms')
    expect(plain).toContain('99.50%')
    expect(plain).toContain('340ms')
  })

  it('renders grouped markdown output by location', () => {
    const grouped: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      requestedMetrics: ['availability', 'responseTime_avg'],
      series: [
        { data: { availability: 99.9, responseTime_avg: 120 }, runLocation: 'us-east-1' },
        { data: { availability: 99.5, responseTime_avg: 340 }, runLocation: 'ap-south-1' },
      ],
    }
    const result = formatAnalyticsSection(grouped, 'last7Days', 'md')
    expect(result).toContain('### us-east-1')
    expect(result).toContain('### ap-south-1')
    expect(result).toContain('99.90%')
  })

  it('renders grouped output by status code', () => {
    const grouped: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      requestedMetrics: ['availability', 'responseTime_avg'],
      series: [
        { data: { availability: 99.9, responseTime_avg: 200 }, statusCode: 200 },
        { data: { availability: 95.0, responseTime_avg: 500 }, statusCode: 500 },
      ],
    }
    const result = formatAnalyticsSection(grouped, 'last24Hours', 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('HTTP 200')
    expect(plain).toContain('HTTP 500')
  })

  it('filters and orders by requestedMetrics', () => {
    const response: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      requestedMetrics: ['responseTime_avg', 'availability'],
      series: [{
        data: { availability: 99.95, responseTime_avg: 245, total: 1000, success: 999 },
      }],
    }
    const result = formatAnalyticsSection(response, 'last24Hours', 'md')
    // Should not contain total or success
    expect(result).not.toContain('Total')
    expect(result).not.toContain('Success')
    // Order should match requestedMetrics (responseTime first)
    const lines = result.split('\n')
    const metricLines = lines.filter(l => l.startsWith('|') && !l.startsWith('| Metric') && !l.startsWith('| ---'))
    expect(metricLines[0]).toContain('Response Time (avg)')
    expect(metricLines[1]).toContain('Availability')
  })
})
