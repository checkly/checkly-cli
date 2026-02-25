import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../render'
import {
  formatStatusPages,
  formatStatusPageTree,
  formatCursorPaginationInfo,
  formatCursorNavigationHints,
} from '../status-pages'
import {
  simpleStatusPage,
  privateStatusPage,
  noCardsStatusPage,
} from './__fixtures__/status-page-fixtures'

describe('formatStatusPages', () => {
  describe('terminal', () => {
    it('renders table with name, url, private, cards count, and id', () => {
      const result = stripAnsi(formatStatusPages([simpleStatusPage, privateStatusPage], 'terminal'))
      expect(result).toContain('NAME')
      expect(result).toContain('URL')
      expect(result).toContain('PRIVATE')
      expect(result).toContain('CARDS')
      expect(result).toContain('Acme Status')
      expect(result).toContain('status.acme.com')
      expect(result).toContain('Internal Tools')
    })

    it('shows card count per page', () => {
      const result = stripAnsi(formatStatusPages([simpleStatusPage], 'terminal'))
      expect(result).toContain('2')
    })

    it('shows private indicator', () => {
      const result = stripAnsi(formatStatusPages([privateStatusPage], 'terminal'))
      expect(result).toContain('yes')
    })

    it('shows dash for non-private pages', () => {
      const result = stripAnsi(formatStatusPages([simpleStatusPage], 'terminal'))
      const lines = result.split('\n')
      const acmeLine = lines.find(l => l.includes('Acme Status'))
      expect(acmeLine).toBeDefined()
    })
  })

  describe('md', () => {
    it('renders a markdown table', () => {
      const result = formatStatusPages([simpleStatusPage, privateStatusPage], 'md')
      expect(result).toContain('| Name |')
      expect(result).toContain('| --- |')
      expect(result).toContain('Acme Status')
      expect(result).toContain('Internal Tools')
    })
  })
})

describe('formatStatusPageTree', () => {
  it('renders cards and services as a tree', () => {
    const result = stripAnsi(formatStatusPageTree(simpleStatusPage))
    expect(result).toContain('Infrastructure')
    expect(result).toContain('API Gateway')
    expect(result).toContain('Database Cluster')
    expect(result).toContain('CDN')
    expect(result).toContain('Web Applications')
    expect(result).toContain('Dashboard')
    expect(result).toContain('Marketing Site')
  })

  it('uses tree characters for hierarchy', () => {
    const result = formatStatusPageTree(simpleStatusPage)
    expect(result).toContain('├──')
    expect(result).toContain('└──')
  })

  it('returns empty string for pages with no cards', () => {
    const result = formatStatusPageTree(noCardsStatusPage)
    expect(result).toBe('')
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
