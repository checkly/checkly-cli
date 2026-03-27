import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../render'
import { formatRcaDetail, formatRcaPending, formatRcaCompleted, transformErrorGroupForJson } from '../rca'
import {
  sampleRca,
  sampleRcaMinimal,
  errorGroupWithRca,
  errorGroupWithMultipleRcas,
  errorGroupWithoutRca,
} from './__fixtures__/fixtures'

describe('formatRcaDetail', () => {
  describe('terminal', () => {
    it('renders classification, root cause, and user impact', () => {
      const result = stripAnsi(formatRcaDetail(sampleRca, 'terminal'))
      expect(result).toContain('ROOT CAUSE ANALYSIS')
      expect(result).toContain('INFRASTRUCTURE_ERROR')
      expect(result).toContain('upstream API returned HTTP 503')
      expect(result).toContain('Users in ap-south-1')
    })

    it('renders code fix when present', () => {
      const result = stripAnsi(formatRcaDetail(sampleRca, 'terminal'))
      expect(result).toContain('Code fix:')
      expect(result).toContain('retry logic')
    })

    it('omits code fix when null', () => {
      const result = stripAnsi(formatRcaDetail(sampleRcaMinimal, 'terminal'))
      expect(result).not.toContain('Code fix:')
    })

    it('renders evidence section', () => {
      const result = stripAnsi(formatRcaDetail(sampleRca, 'terminal'))
      expect(result).toContain('EVIDENCE')
      expect(result).toContain('HTTP_REQUEST')
      expect(result).toContain('TIMING_PHASES')
      expect(result).toContain('TRACE_ROUTE')
      expect(result).toContain('completed with status 503')
    })

    it('omits evidence section when null', () => {
      const result = stripAnsi(formatRcaDetail(sampleRcaMinimal, 'terminal'))
      expect(result).not.toContain('EVIDENCE')
    })

    it('renders reference links', () => {
      const result = stripAnsi(formatRcaDetail(sampleRca, 'terminal'))
      expect(result).toContain('REFERENCES')
      expect(result).toContain('HTTP 503 Service Unavailable')
      expect(result).toContain('https://developer.mozilla.org')
    })

    it('omits references when null', () => {
      const result = stripAnsi(formatRcaDetail(sampleRcaMinimal, 'terminal'))
      expect(result).not.toContain('REFERENCES')
    })
  })

  describe('markdown', () => {
    it('renders RCA as markdown headings', () => {
      const result = formatRcaDetail(sampleRca, 'md')
      expect(result).toContain('## Root Cause Analysis')
      expect(result).toContain('**Classification:**')
      expect(result).toContain('INFRASTRUCTURE_ERROR')
    })

    it('renders code fix when present', () => {
      const result = formatRcaDetail(sampleRca, 'md')
      expect(result).toContain('**Code Fix:**')
      expect(result).toContain('retry logic')
    })

    it('renders evidence as bullet list', () => {
      const result = formatRcaDetail(sampleRca, 'md')
      expect(result).toContain('### Evidence')
      expect(result).toContain('- **HTTP_REQUEST')
    })

    it('renders reference links as markdown links', () => {
      const result = formatRcaDetail(sampleRca, 'md')
      expect(result).toContain('### References')
      expect(result).toContain('[HTTP 503 Service Unavailable]')
    })
  })
})

describe('transformErrorGroupForJson', () => {
  it('transforms latest RCA into latestRootCauseAnalysis', () => {
    const result = transformErrorGroupForJson(errorGroupWithRca)
    expect(result.latestRootCauseAnalysis).toBeDefined()
    expect(result.latestRootCauseAnalysis!.id).toBe('rca-1')
    expect(result.latestRootCauseAnalysis!.classification).toBe('INFRASTRUCTURE_ERROR')
    expect(result.rootCauseAnalysisCount).toBe(1)
  })

  it('picks first entry (most recent) when multiple exist', () => {
    const result = transformErrorGroupForJson(errorGroupWithMultipleRcas)
    expect(result.latestRootCauseAnalysis!.id).toBe('rca-1')
    expect(result.rootCauseAnalysisCount).toBe(2)
  })

  it('returns null and count 0 when no RCA', () => {
    const result = transformErrorGroupForJson(errorGroupWithoutRca)
    expect(result.latestRootCauseAnalysis).toBeNull()
    expect(result.rootCauseAnalysisCount).toBe(0)
  })

  it('strips rootCauseAnalyses array from output', () => {
    const result = transformErrorGroupForJson(errorGroupWithRca)
    expect(result).not.toHaveProperty('rootCauseAnalyses')
  })

  it('flattens analysis fields into latestRootCauseAnalysis', () => {
    const result = transformErrorGroupForJson(errorGroupWithRca)
    const rca = result.latestRootCauseAnalysis!
    expect(rca).toHaveProperty('classification')
    expect(rca).toHaveProperty('rootCause')
    expect(rca).toHaveProperty('userImpact')
    expect(rca).toHaveProperty('codeFix')
    expect(rca).toHaveProperty('evidence')
    expect(rca).toHaveProperty('referenceLinks')
    expect(rca).toHaveProperty('provider')
    expect(rca).toHaveProperty('model')
    expect(rca).toHaveProperty('durationMs')
    expect(rca).toHaveProperty('created_at')
  })
})

describe('formatRcaPending', () => {
  const pendingInfo = {
    rcaId: 'rca-123',
    errorGroupId: 'eg-456',
    checkId: 'check-789',
  }

  it('renders pending state in terminal', () => {
    const result = stripAnsi(formatRcaPending(pendingInfo, 'terminal'))
    expect(result).toContain('Root cause analysis triggered')
    expect(result).toContain('rca-123')
    expect(result).toContain('eg-456')
    expect(result).toContain('pending')
    expect(result).toContain('checkly rca get rca-123 --watch')
    expect(result).toContain('checkly checks get check-789 --error-group eg-456')
  })

  it('renders pending state in json', () => {
    const result = formatRcaPending(pendingInfo, 'json')
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('rca-123')
    expect(parsed.status).toBe('pending')
    expect(parsed.errorGroupId).toBe('eg-456')
  })

  it('renders pending state in markdown', () => {
    const result = formatRcaPending(pendingInfo, 'md')
    expect(result).toContain('# Root Cause Analysis')
    expect(result).toContain('pending')
    expect(result).toContain('rca-123')
  })
})

describe('formatRcaCompleted', () => {
  it('renders completed RCA in terminal', () => {
    const result = stripAnsi(formatRcaCompleted(sampleRca, 'terminal'))
    expect(result).toContain('ROOT CAUSE ANALYSIS')
    expect(result).toContain('INFRASTRUCTURE_ERROR')
  })

  it('renders completed RCA in json', () => {
    const result = formatRcaCompleted(sampleRca, 'json')
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('rca-1')
    expect(parsed.analysis.classification).toBe('INFRASTRUCTURE_ERROR')
  })

  it('renders completed RCA in markdown', () => {
    const result = formatRcaCompleted(sampleRca, 'md')
    expect(result).toContain('## Root Cause Analysis')
    expect(result).toContain('INFRASTRUCTURE_ERROR')
  })
})
