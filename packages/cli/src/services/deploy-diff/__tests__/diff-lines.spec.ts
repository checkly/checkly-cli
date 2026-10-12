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

  describe('with pairProperties, for the source of an object literal', () => {
    const construct = (lines: string[]) => ['new UrlMonitor(\'m\', {', '  name: \'Monitor\',', ...lines, '  request: {', '    url: \'https://example.com\',', '  },', '})'].join('\n') + '\n'

    it('pairs each property\'s old lines with its new ones instead of stacking removals over additions', () => {
      const before = construct([
        '  tags: [',
        '    \'workshop\',',
        '  ],',
        '  frequency: Frequency.EVERY_10M,',
        '  alertChannels: [',
        '    emailAlert,',
        '    claudeRoutine,',
        '  ],',
      ])
      const after = construct([
        '  tags: [',
        '    \'tier-1\',',
        '  ],',
        '  frequency: Frequency.EVERY_1M,',
        '  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {',
        '    amount: 3,',
        '  }, {',
        '    enabled: false,',
        '  }),',
      ])

      expect(unifiedDiff(before, after, { pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        ' new UrlMonitor(\'m\', {',
        '   name: \'Monitor\',',
        '   tags: [',
        // The items continue the `tags` opened above the changed run, so they
        // pair with each other, and the `],` both sides keep is context again.
        '-    \'workshop\',',
        '+    \'tier-1\',',
        '   ],',
        '-  frequency: Frequency.EVERY_10M,',
        '+  frequency: Frequency.EVERY_1M,',
        // A property only one side has stands alone, in the order of its side.
        '-  alertChannels: [',
        '-    emailAlert,',
        '-    claudeRoutine,',
        '-  ],',
        '+  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {',
        '+    amount: 3,',
        '+  }, {',
        '+    enabled: false,',
        '+  }),',
        '   request: {',
        '     url: \'https://example.com\',',
        '   },',
      ])
    })

    it('does not align the two sides on a line of only brackets', () => {
      // Without this, the `],` closing the old `tags` would match the `],`
      // closing the new one, and `frequency` would be removed above the new
      // tag and added below it.
      const before = construct(['  tags: [', '    \'a\',', '  ],', '  frequency: Frequency.EVERY_10M,'])
      const after = construct(['  tags: [', '    \'b\',', '  ],', '  frequency: Frequency.EVERY_1M,'])

      expect(unifiedDiff(before, after, { context: 0, pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        '-    \'a\',',
        '+    \'b\',',
        '@@',
        '-  frequency: Frequency.EVERY_10M,',
        '+  frequency: Frequency.EVERY_1M,',
      ])
    })

    it('keeps an added property where its side puts it', () => {
      const before = construct(['  frequency: Frequency.EVERY_10M,'])
      const after = construct(['  activated: false,', '  frequency: Frequency.EVERY_1M,', '  muted: true,'])

      expect(unifiedDiff(before, after, { context: 0, pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        '+  activated: false,',
        '-  frequency: Frequency.EVERY_10M,',
        '+  frequency: Frequency.EVERY_1M,',
        '+  muted: true,',
      ])
    })

    it('pairs the properties of a nested object in turn', () => {
      const before = construct(['  options: {', '    method: \'GET\',', '    headers: {', '      a: 1,', '    },', '  },'])
      const after = construct(['  options: {', '    method: \'POST\',', '    headers: {', '      a: 2,', '    },', '  },'])

      expect(unifiedDiff(before, after, { context: 0, pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        '-    method: \'GET\',',
        '+    method: \'POST\',',
        '@@',
        '-      a: 1,',
        '+      a: 2,',
      ])
    })

    it('does not keep a closing bracket as context when it ends different properties on the two sides', () => {
      // Both texts end `],` then `})`; the `],` closes `tags` on one side and
      // `locations` on the other, so it belongs to those properties, while
      // the `})` closes the construct on both and stays context.
      const before = 'new A({\n  name: 1,\n  tags: [\n    2,\n  ],\n})\n'
      const after = 'new A({\n  name: 9,\n  tags: [3],\n  locations: [\n    4,\n  ],\n})\n'

      expect(unifiedDiff(before, after, { pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        ' new A({',
        '-  name: 1,',
        '+  name: 9,',
        '-  tags: [',
        '-    2,',
        '-  ],',
        '+  tags: [3],',
        '+  locations: [',
        '+    4,',
        '+  ],',
        ' })',
      ])
    })

    it('keeps every line of both sides, in each side\'s order, when the sides list the keys differently', () => {
      // A key the two sides place differently is not pulled out of order to
      // make a pair; what cannot be paired in order is shown unpaired.
      const before = '{\n  a: 1,\n  b: 1,\n}\n'
      const after = '{\n  b: 2,\n  c: 2,\n  a: 2,\n  d: 2,\n}\n'

      expect(unifiedDiff(before, after, { pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        ' {',
        '+  b: 2,',
        '+  c: 2,',
        '-  a: 1,',
        '+  a: 2,',
        '-  b: 1,',
        '+  d: 2,',
        ' }',
      ])
    })

    it('shows a property with nothing in common as its old lines then its new ones', () => {
      const before = construct(['  retryStrategy: RetryStrategyBuilder.fixedStrategy({', '    maxRetries: 2,', '  }),'])
      const after = construct(['  retryStrategy: RetryStrategyBuilder.noRetries(),'])

      expect(unifiedDiff(before, after, { context: 0, pairProperties: true })).toEqual([
        '--- deployed',
        '+++ local',
        '@@',
        '-  retryStrategy: RetryStrategyBuilder.fixedStrategy({',
        '-    maxRetries: 2,',
        '-  }),',
        '+  retryStrategy: RetryStrategyBuilder.noRetries(),',
      ])
    })
  })

  it('leaves a plain text alone without pairProperties, aligning on blank lines and braces as before', () => {
    // A script is not an object literal: a block that moves past a blank
    // line or a closing brace is still shown as the move it is.
    const before = 'first()\n}\n\n}\nsecond()\n'
    const after = 'second()\n}\n\n}\nfirst()\n'

    expect(unifiedDiff(before, after)).toEqual([
      '--- deployed',
      '+++ local',
      '@@',
      '-first()',
      '+second()',
      ' }',
      ' ',
      ' }',
      '-second()',
      '+first()',
    ])
  })
})
