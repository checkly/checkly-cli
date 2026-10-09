import { describe, expect, it } from 'vitest'
import { stripAnsi } from '../render.js'
import { formatViewDetail, formatViewsList } from '../views.js'
import type { View } from '../../rest/views.js'

const view: View = {
  id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  page: 'monitors',
  name: 'Failing production',
  filters: { status: ['failing', 'degraded'], tags: [], traces: null, search: 'checkout' },
  counter: 'failing',
  visibility: 'ACCOUNT',
  createdBy: { id: '22222222-2222-2222-2222-222222222222', name: 'Ada Admin', isMember: false },
  canUpdate: true,
  canDelete: false,
  canShare: true,
  hidden: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

describe('formatViewsList', () => {
  it('marks a creator who left the account', () => {
    const result = stripAnsi(formatViewsList([view], 'terminal'))
    expect(result).toContain('Ada Admin (former member)')
  })

  it('shows a dash for views without a creator or counter, and no for a visible view', () => {
    const result = formatViewsList([{ ...view, createdBy: null, counter: null }], 'md')
    expect(result).toContain('| Failing production | monitors | account | - | - | no |')
  })

  it('shows yes for a hidden view', () => {
    const result = stripAnsi(formatViewsList([{ ...view, hidden: true }], 'terminal'))
    expect(result.split('\n')[1]).toMatch(/\syes\s/)
  })
})

describe('formatViewDetail', () => {
  it('renders every filter on its own row in the terminal', () => {
    const result = stripAnsi(formatViewDetail(view, 'terminal'))
    expect(result).toMatch(/Permissions:\s+update, share/)
    expect(result).toMatch(/Created by:\s+Ada Admin \(former member\)/)
    expect(result).toMatch(/status\s+failing, degraded/)
    expect(result).toMatch(/tags\s+-/)
    expect(result).toMatch(/traces\s+-/)
    expect(result).toMatch(/search\s+checkout/)
  })

  it('renders the filters as a markdown table', () => {
    const result = formatViewDetail(view, 'md')
    expect(result).toContain('# Failing production')
    expect(result).toContain('## Filters')
    expect(result).toContain('| Filter | Value |')
    expect(result).toContain('| status | failing, degraded |')
  })

  it('says so when a view has no filters', () => {
    expect(stripAnsi(formatViewDetail({ ...view, filters: {} }, 'terminal'))).toContain('No filters.')
    expect(formatViewDetail({ ...view, filters: {} }, 'md')).toContain('## Filters\n\nNo filters.')
  })

  it('reports no permissions as none', () => {
    const result = stripAnsi(formatViewDetail({ ...view, canUpdate: false, canDelete: false, canShare: false }, 'terminal'))
    expect(result).toMatch(/Permissions:\s+none/)
  })
})
