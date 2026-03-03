import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../render'
import {
  formatStatusPagesExpanded,
  formatStatusPagesCompact,
  formatCursorPaginationInfo,
  formatCursorNavigationHints,
  formatStatusPageDetail,
} from '../status-pages'
import {
  simpleStatusPage,
  privateStatusPage,
  noCardsStatusPage,
} from './__fixtures__/status-page-fixtures'

describe('formatStatusPagesExpanded', () => {
  describe('terminal', () => {
    it('renders one row per service with all fields repeated', () => {
      const result = stripAnsi(formatStatusPagesExpanded([simpleStatusPage], 'terminal'))
      expect(result).toContain('NAME')
      expect(result).toContain('URL')
      expect(result).toContain('CARD')
      expect(result).toContain('SERVICE')
      expect(result).toContain('ID')

      const lines = result.split('\n').filter(l => l.includes('Acme Status'))
      // simpleStatusPage has 5 services across 2 cards
      expect(lines).toHaveLength(5)
    })

    it('repeats name, url, and id on every service row', () => {
      const result = stripAnsi(formatStatusPagesExpanded([simpleStatusPage], 'terminal'))
      const lines = result.split('\n').filter(l => l.includes('Acme Status'))
      for (const line of lines) {
        expect(line).toContain('Acme Status')
        expect(line).toContain('a1b2c3d4')
      }
    })

    it('repeats card name on every service row of that card', () => {
      const result = stripAnsi(formatStatusPagesExpanded([simpleStatusPage], 'terminal'))
      const infraLines = result.split('\n').filter(l => l.includes('Infrastructure'))
      expect(infraLines).toHaveLength(3) // 3 services in Infrastructure card
      for (const line of infraLines) {
        expect(line).toContain('Infrastructure')
      }
    })

    it('shows each service name on its own row', () => {
      const result = stripAnsi(formatStatusPagesExpanded([simpleStatusPage], 'terminal'))
      expect(result).toContain('API Gateway')
      expect(result).toContain('Database Cluster')
      expect(result).toContain('CDN')
      expect(result).toContain('Dashboard')
      expect(result).toContain('Marketing Site')
    })

    it('renders a fallback row for pages with no cards', () => {
      const result = stripAnsi(formatStatusPagesExpanded([noCardsStatusPage], 'terminal'))
      const lines = result.split('\n').filter(l => l.includes('Empty Page'))
      expect(lines).toHaveLength(1)
    })

    it('handles multiple status pages', () => {
      const result = stripAnsi(formatStatusPagesExpanded([simpleStatusPage, privateStatusPage], 'terminal'))
      const acmeLines = result.split('\n').filter(l => l.includes('Acme Status'))
      const internalLines = result.split('\n').filter(l => l.includes('Internal Tools'))
      expect(acmeLines).toHaveLength(5)
      expect(internalLines).toHaveLength(1)
    })
  })

  describe('md', () => {
    it('renders a markdown table with card and service columns', () => {
      const result = formatStatusPagesExpanded([simpleStatusPage], 'md')
      expect(result).toContain('| Name |')
      expect(result).toContain('| Card |')
      expect(result).toContain('| Service |')
      expect(result).toContain('| --- |')
      expect(result).toContain('API Gateway')
    })
  })
})

describe('formatStatusPagesCompact', () => {
  describe('terminal', () => {
    it('renders one row per status page with card count', () => {
      const result = stripAnsi(formatStatusPagesCompact([simpleStatusPage, privateStatusPage], 'terminal'))
      expect(result).toContain('CARDS')
      const acmeLines = result.split('\n').filter(l => l.includes('Acme Status'))
      expect(acmeLines).toHaveLength(1)
    })

    it('shows private indicator', () => {
      const result = stripAnsi(formatStatusPagesCompact([privateStatusPage], 'terminal'))
      expect(result).toContain('yes')
    })

    it('shows dash for non-private pages', () => {
      const result = stripAnsi(formatStatusPagesCompact([simpleStatusPage], 'terminal'))
      const acmeLine = result.split('\n').find(l => l.includes('Acme Status'))
      expect(acmeLine).toBeDefined()
      expect(acmeLine).toContain('-')
    })
  })

  describe('md', () => {
    it('renders a compact markdown table', () => {
      const result = formatStatusPagesCompact([simpleStatusPage, privateStatusPage], 'md')
      expect(result).toContain('| Name |')
      expect(result).toContain('| Cards |')
      expect(result).toContain('Acme Status')
      expect(result).toContain('Internal Tools')
    })
  })
})

describe('formatCursorPaginationInfo', () => {
  it('shows count when no more pages', () => {
    const result = stripAnsi(formatCursorPaginationInfo(2, null))
    expect(result).toContain('2 status pages')
  })

  it('indicates more pages available', () => {
    const result = stripAnsi(formatCursorPaginationInfo(25, 'abc123'))
    expect(result).toContain('25 status pages')
    expect(result).toContain('more available')
  })
})

describe('formatCursorNavigationHints', () => {
  it('shows next page hint when cursor exists', () => {
    const result = stripAnsi(formatCursorNavigationHints('abc123'))
    expect(result).toContain('--cursor')
    expect(result).toContain('abc123')
  })

  it('omits next page when no cursor', () => {
    const result = stripAnsi(formatCursorNavigationHints(null))
    expect(result).not.toContain('--cursor')
  })
})

describe('formatStatusPageDetail', () => {
  describe('terminal', () => {
    it('renders the page name as title', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('Acme Status')
    })

    it('shows url field', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('status.acme.com')
    })

    it('shows private field as no for public pages', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('no')
    })

    it('shows private field as yes for private pages', () => {
      const result = stripAnsi(formatStatusPageDetail(privateStatusPage, 'terminal'))
      expect(result).toContain('yes')
    })

    it('shows theme', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('AUTO')
    })

    it('shows the page ID', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    })

    it('includes a services table with card and service names', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('CARD')
      expect(result).toContain('SERVICE')
      expect(result).toContain('Infrastructure')
      expect(result).toContain('API Gateway')
      expect(result).toContain('Database Cluster')
      expect(result).toContain('CDN')
      expect(result).toContain('Web Applications')
      expect(result).toContain('Dashboard')
      expect(result).toContain('Marketing Site')
    })

    it('includes service IDs in the table', () => {
      const result = stripAnsi(formatStatusPageDetail(simpleStatusPage, 'terminal'))
      expect(result).toContain('svc-1111')
      expect(result).toContain('svc-5555')
    })

    it('shows no services message for pages with no cards', () => {
      const result = stripAnsi(formatStatusPageDetail(noCardsStatusPage, 'terminal'))
      expect(result).toContain('No services')
    })
  })

  describe('md', () => {
    it('renders markdown detail fields', () => {
      const result = formatStatusPageDetail(simpleStatusPage, 'md')
      expect(result).toContain('# Acme Status')
      expect(result).toContain('| Field | Value |')
      expect(result).toContain('status.acme.com')
    })

    it('renders a markdown services table', () => {
      const result = formatStatusPageDetail(simpleStatusPage, 'md')
      expect(result).toContain('## Services')
      expect(result).toContain('| Card |')
      expect(result).toContain('| Service |')
      expect(result).toContain('API Gateway')
    })
  })
})
