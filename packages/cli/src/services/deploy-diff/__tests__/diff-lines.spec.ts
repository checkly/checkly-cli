import { describe, expect, it } from 'vitest'

import { diffLines, type DiffLine, type DiffLinesOptions } from '../diff-lines.js'

const lines = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `line${index + from}`).join('\n') + '\n'

const OP_BY_KIND: Record<DiffLine['kind'], string> = { context: ' ', remove: '-', add: '+', hunk: '@@' }

/**
 * The typed lines spelled as `diff -u` would print them, less the hunk
 * numbers, so every expectation below reads like the diff it checks.
 */
function unifiedDiff (before: string, after: string, options?: DiffLinesOptions): string[] | undefined {
  const result = diffLines(before, after, options)
  if (result === undefined || result.length === 0) {
    return result === undefined ? undefined : []
  }
  return ['--- deployed', '+++ local', ...result.map(line => `${OP_BY_KIND[line.kind]}${line.text}`)]
}

describe('diffLines()', () => {
  it('reports nothing for identical texts', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n')).toEqual([])
  })

  it('reports nothing when the texts differ only by a trailing newline', () => {
    // A construct rendered with and without a final newline is the same
    // construct; reporting it would put a change on every resource.
    expect(unifiedDiff('a\nb\n', 'a\nb')).toEqual([])
    expect(unifiedDiff('a\nb', 'a\nb\n')).toEqual([])
  })

  it('renders an insertion with its context', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nb\nx\nc\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' a',
      ' b',
      '+x',
      ' c',
    ])
  })

  it('renders a deletion with its context', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nc\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' a',
      '-b',
      ' c',
    ])
  })

  it('renders a replaced line as a deletion followed by an insertion', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' a',
      '-b',
      '+B',
      ' c',
    ])
  })

  it('diffs against an empty side', () => {
    expect(unifiedDiff('', 'a\nb\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      '+a',
      '+b',
    ])
    expect(unifiedDiff('a\nb\n', '')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      '-a',
      '-b',
    ])
  })

  it('keeps three lines of context around a change in the middle', () => {
    const before = lines(11)
    const after = before.replace('line6\n', 'six\n')

    expect(unifiedDiff(before, after)).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' line3',
      ' line4',
      ' line5',
      '-line6',
      '+six',
      ' line7',
      ' line8',
      ' line9',
    ])
  })

  it('merges two changes whose context regions touch into one hunk', () => {
    const before = lines(12)
    const after = before.replace('line2\n', 'two\n').replace('line5\n', 'five\n')

    expect(unifiedDiff(before, after)).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' line1',
      '-line2',
      '+two',
      ' line3',
      ' line4',
      '-line5',
      '+five',
      ' line6',
      ' line7',
      ' line8',
    ])
  })

  it('keeps two distant changes in separate hunks', () => {
    const before = lines(30)
    const after = before.replace('line3\n', 'three\n').replace('line20\n', 'twenty\n')

    const result = unifiedDiff(before, after)

    expect(result?.filter(line => line.startsWith('@@'))).toEqual([
      '@@',
      '@@',
    ])
    // Nothing between the hunks is printed: that is the point of the split.
    expect(result).not.toContain(' line12')
  })

  it('honours the context option', () => {
    const before = lines(11)
    const after = before.replace('line6\n', 'six\n')

    expect(unifiedDiff(before, after, { context: 1 })).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      ' line5',
      '-line6',
      '+six',
      ' line7',
    ])
  })

  it('declines a comparison larger than maxLines', () => {
    // The comparison is quadratic in the lines that differ, and a caller that
    // gets nothing back has a coarser listing to print instead.
    expect(unifiedDiff(lines(5), lines(5, 100), { maxLines: 4 })).toBeUndefined()
    expect(unifiedDiff(lines(4), lines(4, 100), { maxLines: 4 })).not.toBeUndefined()
  })

  it('declines rather than throwing when a raised maxLines would overflow the comparison', () => {
    // The cost is the product of the two sides, not their length, so a caller
    // that tunes maxLines must still get the documented `undefined` back and
    // not a RangeError from the typed array.
    let result: string[] | undefined
    expect(() => {
      result = unifiedDiff(lines(3000), lines(3000, 10_000), { maxLines: 5000 })
    }).not.toThrow()
    expect(result).toBeUndefined()
  })

  it('still compares two sides that differ only in the middle of a large text', () => {
    // The head and tail trim is what keeps a realistic comparison well inside
    // the cell budget: these are 3000 lines a side, but only one differs.
    const before = lines(3000)
    const after = before.replace('line1500\n', 'changed\n')

    expect(unifiedDiff(before, after, { maxLines: 5000 })?.[2]).toEqual('@@')
  })

  it('compares texts that share no lines at all', () => {
    expect(unifiedDiff('a\nb\n', 'x\ny\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      '-a',
      '-b',
      '+x',
      '+y',
    ])
  })
})
