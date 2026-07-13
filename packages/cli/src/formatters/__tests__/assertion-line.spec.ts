import { describe, it, expect } from 'vitest'

import { truncate } from '../assertion-line.js'

describe('truncate', () => {
  it('does not flag a value as truncated when it fits the char cap', () => {
    const { truncated, result } = truncate('hello', { chars: 300, ending: '...truncated...' })
    expect(truncated).toBe(false)
    expect(result).toBe('hello')
  })

  it('truncates by code point and appends the ending when the cap is exceeded', () => {
    const { truncated, result } = truncate('abcdef', { chars: 3, ending: '…' })
    expect(truncated).toBe(true)
    expect(result).toBe('abc…')
  })

  it('measures the cap in code points, not UTF-16 units', () => {
    // 200 emoji: 200 code points but 400 UTF-16 units. With a 300-char cap the
    // value fits by code point, so it must be left whole with no truncation
    // suffix — measuring `.length` (400) would wrongly flag it as truncated.
    const emoji = '😀'.repeat(200)
    const { truncated, result } = truncate(emoji, { chars: 300, ending: '...truncated...' })
    expect(truncated).toBe(false)
    expect(result).toBe(emoji)
    expect(result).not.toContain('truncated')
  })

  it('never splits a surrogate pair when cutting astral characters', () => {
    const { result } = truncate('😀'.repeat(5), { chars: 2, ending: '' })
    expect(result).toBe('😀😀')
    expect([...result]).toHaveLength(2)
  })

  it('caps stringified objects, which have no meaningful length', () => {
    const { truncated, result } = truncate({ a: 'x'.repeat(500) }, { chars: 100, ending: '…' })
    expect(truncated).toBe(true)
    expect([...result]).toHaveLength(101) // 100 code points + the single-char ending
  })
})
