import { describe, it, expect } from 'vitest'
import type { AnalyticsResponse } from '../../rest/analytics'
import {
  extractMetrics,
  formatMetricValue,
  formatMetricLabel,
  formatAnalyticsSection,
} from '../analytics'
import { stripAnsi } from '../render'

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
  series: [{ data: {
    availability: 99.95,
    responseTime_avg: 245,
    responseTime_p50: 180,
    responseTime_p95: 890,
    responseTime_p99: 2400,
  } }],
  metadata: [],
}

describe('extractMetrics', () => {
  it('extracts numeric values from series data', () => {
    const metrics = extractMetrics(mockAnalyticsResponse)
    expect(metrics).toEqual({
      availability: 99.95,
      responseTime_avg: 245,
      responseTime_p50: 180,
      responseTime_p95: 890,
      responseTime_p99: 2400,
    })
  })

  it('handles empty series', () => {
    const response: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      series: [],
    }
    expect(extractMetrics(response)).toEqual({})
  })

  it('handles missing data in series', () => {
    const response: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      series: [{ data: {} }],
    }
    expect(extractMetrics(response)).toEqual({})
  })

  it('skips null and empty string values', () => {
    const response: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      series: [{ data: { availability: null, responseTime_avg: '', valid: 42 } }],
    }
    expect(extractMetrics(response)).toEqual({ valid: 42 })
  })

  it('parses string values as floats', () => {
    const response: AnalyticsResponse = {
      ...mockAnalyticsResponse,
      series: [{ data: { responseTime_avg: '245.5' } }],
    }
    expect(extractMetrics(response)).toEqual({ responseTime_avg: 245.5 })
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

  it('formats generic numbers plainly', () => {
    const result = formatMetricValue('unknownMetric', 3.14159, 'terminal')
    expect(result).toBe('3.14')
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
})
