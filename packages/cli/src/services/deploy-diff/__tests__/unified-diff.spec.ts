import { describe, expect, it } from 'vitest'

import { unifiedDiff } from '../unified-diff.js'

const lines = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `line${index + from}`).join('\n') + '\n'

describe('unifiedDiff()', () => {
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
      '@@ -1,3 +1,4 @@',
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
      '@@ -1,3 +1,2 @@',
      ' a',
      '-b',
      ' c',
    ])
  })

  it('renders a replaced line as a deletion followed by an insertion', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+B',
      ' c',
    ])
  })

  // Every expected header in this block was taken from `git diff --no-index`
  // on the same two inputs, at the same context.
  describe('hunk headers, against git diff', () => {
    it('omits the count for a single-line side', () => {
      expect(unifiedDiff('a\n', 'b\n')).toEqual([
        '--- deployed',
        '+++ local',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ])
    })

    it('omits it on one side only when only that side spans one line', () => {
      expect(unifiedDiff('a\n', 'a\nb\n')?.[2]).toEqual('@@ -1 +1,2 @@')
      expect(unifiedDiff('a\nb\nc\n', 'a\n')?.[2]).toEqual('@@ -1,3 +1 @@')
    })

    it('numbers an empty range at the lines that precede it', () => {
      // At context 0 nothing pads the hunk, so the empty side's own number is
      // what is printed. `diff -U0` gives each of these headers.
      expect(unifiedDiff('a\nb\nc\n', 'a\nx\nb\nc\n', { context: 0 })).toEqual([
        '--- deployed',
        '+++ local',
        '@@ -1,0 +2 @@',
        '+x',
      ])
      expect(unifiedDiff('a\nb\nc\nd\n', 'a\nb\nc\nd\ne\n', { context: 0 })?.[2])
        .toEqual('@@ -4,0 +5 @@')
    })

    it('numbers an empty range before the first line as 0, the way git does', () => {
      // Nothing precedes the change, so the empty side is line 0. BSD diff
      // (the macOS binary) says `1,0` here; git and GNU diff say `0,0`, and
      // these expectations came from `git diff --no-index -U0`.
      expect(unifiedDiff('a\nb\nc\n', 'x\na\nb\nc\n', { context: 0 })?.[2])
        .toEqual('@@ -0,0 +1 @@')
      expect(unifiedDiff('a\nb\nc\n', 'b\nc\n', { context: 0 })?.[2])
        .toEqual('@@ -1 +0,0 @@')
    })
  })

  it('numbers an empty side at the line it follows, like diff -u', () => {
    expect(unifiedDiff('', 'a\nb\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@ -0,0 +1,2 @@',
      '+a',
      '+b',
    ])
    expect(unifiedDiff('a\nb\n', '')).toEqual([
      '--- deployed',
      '+++ local',
      '@@ -1,2 +0,0 @@',
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
      '@@ -3,7 +3,7 @@',
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
      '@@ -1,8 +1,8 @@',
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
      '@@ -1,6 +1,6 @@',
      '@@ -17,7 +17,7 @@',
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
      '@@ -5,3 +5,3 @@',
      ' line5',
      '-line6',
      '+six',
      ' line7',
    ])
  })

  it('names the two sides as asked', () => {
    const result = unifiedDiff('a\n', 'b\n', { beforeLabel: 'in Checkly', afterLabel: 'in code' })

    expect(result?.slice(0, 2)).toEqual(['--- in Checkly', '+++ in code'])
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

    expect(unifiedDiff(before, after, { maxLines: 5000 })?.[2]).toEqual('@@ -1497,7 +1497,7 @@')
  })

  it('compares texts that share no lines at all', () => {
    expect(unifiedDiff('a\nb\n', 'x\ny\n')).toEqual([
      '--- deployed',
      '+++ local',
      '@@ -1,2 +1,2 @@',
      '-a',
      '-b',
      '+x',
      '+y',
    ])
  })
})
