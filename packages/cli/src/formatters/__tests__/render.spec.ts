import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  stripAnsi,
  visWidth,
  padColumn,
  truncateToWidth,
  heading,
  formatMs,
  timeAgo,
  formatFrequency,
  formatCheckType,
  formatDate,
  resolveResultStatus,
  truncateError,
  renderDetailFields,
  renderTable,
  type DetailField,
  type ColumnDef,
} from '../render'

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\u001B[1mBold\u001B[0m')).toBe('Bold')
    expect(stripAnsi('\u001B[31mred\u001B[39m text')).toBe('red text')
  })

  it('returns clean strings unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })
})

describe('visWidth', () => {
  it('returns correct width for plain text', () => {
    expect(visWidth('hello')).toBe(5)
  })

  it('ignores ANSI codes in width calculation', () => {
    expect(visWidth('\u001B[1mBold\u001B[0m')).toBe(4)
  })
})

describe('padColumn', () => {
  it('pads value to target width', () => {
    const result = padColumn('hi', 10)
    expect(result).toBe('hi        ')
    expect(result.length).toBe(10)
  })

  it('does not truncate values wider than target', () => {
    const result = padColumn('hello world', 5)
    expect(result).toBe('hello world')
  })
})

describe('truncateToWidth', () => {
  it('returns value unchanged when it fits', () => {
    expect(truncateToWidth('short', 10)).toBe('short')
  })

  it('truncates with ellipsis when too long', () => {
    const result = truncateToWidth('this is a very long string', 10)
    expect(result.length).toBeLessThanOrEqual(11) // ellipsis is multi-byte
    expect(result).toContain('…')
  })
})

describe('heading', () => {
  it('returns markdown heading with # prefix', () => {
    expect(heading('Title', 1, 'md')).toBe('# Title')
    expect(heading('Sub', 2, 'md')).toBe('## Sub')
    expect(heading('Deep', 3, 'md')).toBe('### Deep')
  })

  it('returns bold text for terminal format', () => {
    const result = heading('Title', 1, 'terminal')
    expect(stripAnsi(result)).toBe('Title')
    // chalk.bold wraps text; in non-TTY it may strip ANSI, so just verify content
    expect(result).toContain('Title')
  })
})

describe('formatMs', () => {
  it('formats milliseconds under 1000', () => {
    expect(formatMs(245)).toBe('245ms')
    expect(formatMs(0)).toBe('0ms')
    expect(formatMs(999)).toBe('999ms')
  })

  it('formats boundary value 999.6 as seconds not 1000ms', () => {
    expect(formatMs(999.6)).toBe('1.00s')
  })

  it('formats milliseconds 1000+ as seconds', () => {
    expect(formatMs(1000)).toBe('1.00s')
    expect(formatMs(1500)).toBe('1.50s')
    expect(formatMs(12345)).toBe('12.35s')
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows seconds ago', () => {
    expect(timeAgo('2025-06-15T11:59:30.000Z')).toBe('30s ago')
  })

  it('shows minutes ago', () => {
    expect(timeAgo('2025-06-15T11:55:00.000Z')).toBe('5m ago')
  })

  it('shows hours ago', () => {
    expect(timeAgo('2025-06-15T09:00:00.000Z')).toBe('3h ago')
  })

  it('shows days ago', () => {
    expect(timeAgo('2025-06-10T12:00:00.000Z')).toBe('5d ago')
  })

  it('shows months ago', () => {
    expect(timeAgo('2025-03-15T12:00:00.000Z')).toBe('3mo ago')
  })
})

describe('formatFrequency', () => {
  it('returns dash for null/undefined', () => {
    expect(formatFrequency(null)).toBe('-')
    expect(formatFrequency(undefined)).toBe('-')
  })

  it('returns <1m for zero', () => {
    expect(formatFrequency(0)).toBe('<1m')
  })

  it('returns minutes for values under 60', () => {
    expect(formatFrequency(5)).toBe('5m')
    expect(formatFrequency(30)).toBe('30m')
  })

  it('returns hours for values evenly divisible by 60', () => {
    expect(formatFrequency(60)).toBe('1h')
    expect(formatFrequency(120)).toBe('2h')
  })

  it('returns minutes for values not evenly divisible by 60', () => {
    expect(formatFrequency(90)).toBe('90m')
  })
})

describe('formatCheckType', () => {
  it('maps known check types', () => {
    expect(formatCheckType('API')).toBe('API')
    expect(formatCheckType('BROWSER')).toBe('BROWSER')
    expect(formatCheckType('MULTI_STEP')).toBe('MULTISTEP')
    expect(formatCheckType('HEARTBEAT')).toBe('HEARTBEAT')
    expect(formatCheckType('TCP')).toBe('TCP')
  })

  it('falls back to input for unknown types', () => {
    expect(formatCheckType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE')
  })
})

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2025-06-15T12:30:45.123Z', 'terminal')
    expect(stripAnsi(result)).toBe('2025-06-15 12:30:45 UTC')
  })

  it('returns dash for null/undefined in terminal', () => {
    const result = formatDate(null, 'terminal')
    expect(stripAnsi(result)).toBe('-')
  })

  it('returns dash for null/undefined in md', () => {
    expect(formatDate(undefined, 'md')).toBe('-')
  })

  it('formats consistently in both formats', () => {
    const date = '2025-01-01T00:00:00.000Z'
    const termResult = stripAnsi(formatDate(date, 'terminal'))
    const mdResult = formatDate(date, 'md')
    expect(termResult).toBe(mdResult)
  })
})

describe('resolveResultStatus', () => {
  it('returns error for hasErrors', () => {
    const result = { hasErrors: true, hasFailures: false, isDegraded: false }
    expect(resolveResultStatus(result, 'md')).toBe('error')
    expect(stripAnsi(resolveResultStatus(result, 'terminal'))).toBe('error')
  })

  it('returns failing for hasFailures', () => {
    const result = { hasErrors: false, hasFailures: true, isDegraded: false }
    expect(resolveResultStatus(result, 'md')).toBe('failing')
    expect(stripAnsi(resolveResultStatus(result, 'terminal'))).toBe('failing')
  })

  it('returns degraded for isDegraded', () => {
    const result = { hasErrors: false, hasFailures: false, isDegraded: true }
    expect(resolveResultStatus(result, 'md')).toBe('degraded')
    expect(stripAnsi(resolveResultStatus(result, 'terminal'))).toBe('degraded')
  })

  it('returns passing when all false', () => {
    const result = { hasErrors: false, hasFailures: false, isDegraded: false }
    expect(resolveResultStatus(result, 'md')).toBe('passing')
    expect(stripAnsi(resolveResultStatus(result, 'terminal'))).toBe('passing')
  })

  it('returns plain labels in terminal format', () => {
    const passing = resolveResultStatus({ hasErrors: false, hasFailures: false, isDegraded: false }, 'terminal')
    const failing = resolveResultStatus({ hasErrors: false, hasFailures: true, isDegraded: false }, 'terminal')
    expect(stripAnsi(passing)).toBe('passing')
    expect(stripAnsi(failing)).toBe('failing')
  })

  it('hasErrors takes precedence over hasFailures and isDegraded', () => {
    const result = { hasErrors: true, hasFailures: true, isDegraded: true }
    expect(resolveResultStatus(result, 'md')).toBe('error')
  })

  it('hasFailures takes precedence over isDegraded', () => {
    const result = { hasErrors: false, hasFailures: true, isDegraded: true }
    expect(resolveResultStatus(result, 'md')).toBe('failing')
  })

  it('resolves passing when isDegraded is null', () => {
    const result = { hasErrors: false, hasFailures: false, isDegraded: null }
    expect(resolveResultStatus(result, 'md')).toBe('passing')
  })
})

describe('truncateError', () => {
  it('returns short messages unchanged', () => {
    expect(truncateError('short error', 50)).toBe('short error')
  })

  it('truncates long messages with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = truncateError(long, 50)
    expect(result.length).toBe(50)
    expect(result.endsWith('…')).toBe(true)
  })

  it('strips ANSI codes and normalizes whitespace', () => {
    const input = '\u001B[31mError:\u001B[0m\nmulti\n  line  message'
    const result = truncateError(input, 100)
    expect(result).toBe('Error: multi line message')
  })
})

describe('renderDetailFields', () => {
  interface TestItem { name: string, age: number, optional?: string }

  const fields: DetailField<TestItem>[] = [
    { label: 'Name', value: item => item.name },
    { label: 'Age', value: item => String(item.age) },
    { label: 'Optional', value: item => item.optional ?? null },
  ]

  it('renders terminal detail with title and aligned labels', () => {
    const result = stripAnsi(renderDetailFields('Test Title', fields, { name: 'Alice', age: 30 }, 'terminal'))
    expect(result).toContain('Test Title')
    expect(result).toContain('Name:')
    expect(result).toContain('Alice')
    expect(result).toContain('Age:')
    expect(result).toContain('30')
  })

  it('omits fields that return null in terminal', () => {
    const result = stripAnsi(renderDetailFields('Test', fields, { name: 'Alice', age: 30 }, 'terminal'))
    expect(result).not.toContain('Optional')
  })

  it('includes fields when value is not null in terminal', () => {
    const result = stripAnsi(renderDetailFields('Test', fields, { name: 'Bob', age: 25, optional: 'present' }, 'terminal'))
    expect(result).toContain('Optional:')
    expect(result).toContain('present')
  })

  it('renders markdown detail with table format', () => {
    const result = renderDetailFields('Test Title', fields, { name: 'Alice', age: 30 }, 'md')
    expect(result).toContain('# Test Title')
    expect(result).toContain('| Field | Value |')
    expect(result).toContain('| --- | --- |')
    expect(result).toContain('| Name | Alice |')
    expect(result).toContain('| Age | 30 |')
  })

  it('omits fields that return null in markdown', () => {
    const result = renderDetailFields('Test', fields, { name: 'Alice', age: 30 }, 'md')
    expect(result).not.toContain('Optional')
  })

  it('aligns terminal labels to consistent column', () => {
    const result = stripAnsi(renderDetailFields('T', fields, { name: 'A', age: 1, optional: 'x' }, 'terminal'))
    const lines = result.split('\n').slice(2) // skip title + empty line
    const valuePositions = lines.map(l => {
      const match = l.match(/:\s+/)
      return match ? l.indexOf(match[0]) + match[0].length : -1
    })
    // All values should start at the same column
    expect(new Set(valuePositions).size).toBe(1)
  })
})

describe('renderTable', () => {
  interface Row { name: string, score: number }

  const columns: ColumnDef<Row>[] = [
    { header: 'Name', width: 12, value: r => r.name },
    { header: 'Score', value: r => String(r.score) },
  ]

  const rows: Row[] = [
    { name: 'Alice', score: 95 },
    { name: 'Bob', score: 87 },
  ]

  it('renders terminal table with uppercased bold headers', () => {
    const result = stripAnsi(renderTable(columns, rows, 'terminal'))
    expect(result).toContain('NAME')
    expect(result).toContain('SCORE')
  })

  it('renders terminal table with padded columns and data', () => {
    const result = stripAnsi(renderTable(columns, rows, 'terminal'))
    expect(result).toContain('Alice')
    expect(result).toContain('95')
    expect(result).toContain('Bob')
    expect(result).toContain('87')
  })

  it('renders markdown table with header and separator', () => {
    const result = renderTable(columns, rows, 'md')
    expect(result).toContain('| Name | Score |')
    expect(result).toContain('| --- | --- |')
    expect(result).toContain('| Alice | 95 |')
    expect(result).toContain('| Bob | 87 |')
  })

  it('handles empty rows in terminal', () => {
    const result = stripAnsi(renderTable(columns, [], 'terminal'))
    const lines = result.split('\n')
    expect(lines).toHaveLength(1) // header only
    expect(lines[0]).toContain('NAME')
  })

  it('handles empty rows in markdown', () => {
    const result = renderTable(columns, [], 'md')
    const lines = result.split('\n')
    expect(lines).toHaveLength(2) // header + separator
  })

  it('last column has no padding in terminal', () => {
    const result = stripAnsi(renderTable(columns, rows, 'terminal'))
    const lines = result.split('\n')
    // Last column value should not have trailing spaces
    expect(lines[1].trimEnd()).toBe(lines[1])
  })
})

describe('field-count parity', () => {
  it('checkDetailFields has expected field count', async () => {
    const { checkDetailFields } = await import('../checks')
    expect(checkDetailFields).toHaveLength(14)
  })

  it('resultDetailFields has expected field count', async () => {
    const { resultDetailFields } = await import('../check-result-detail')
    expect(resultDetailFields).toHaveLength(8)
  })
})
