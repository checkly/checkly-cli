import { describe, expect, it } from 'vitest'
import { wrap } from '../wrap.js'

describe('wrap', () => {
  it('leaves a blank line empty instead of indenting it', () => {
    expect(wrap('First.\n\nSecond.', { prefix: '  ', length: 78 })).toBe('  First.\n\n  Second.')
  })

  it('keeps the indentation of a line that has text', () => {
    expect(wrap('Options:\n  --flag', { prefix: '  ', length: 78 })).toBe('  Options:\n    --flag')
  })

  it('breaks a line before a word that would make it longer than the length', () => {
    expect(wrap('aaa bbb ccc', { prefix: '  ', length: 9 })).toBe('  aaa bbb\n  ccc')
  })
})
