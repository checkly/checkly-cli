import { describe, expect, it } from 'vitest'

import {
  array,
  expr,
  ident,
  lineComment,
  object,
  Output,
  singleLineCommentText,
  TrailingCommentValue,
  Value,
} from '../index.js'

function render (value: Value): string {
  const output = new Output()
  value.render(output)
  return output.finalize()
}

const ref = (id: number, name: string) => new TrailingCommentValue(
  expr(ident('AlertChannel'), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => builder.number(id))
  }),
  lineComment(name),
)

describe('TrailingCommentValue', () => {
  it('puts the comment after the comma of an object property', () => {
    const value = object(builder => {
      builder.value('group', ref(42, 'Backend'))
      builder.string('name', 'Check')
    })
    expect(render(value)).toEqual([
      '{',
      '  group: AlertChannel.fromId(42), // Backend',
      '  name: \'Check\',',
      '}',
      '',
    ].join('\n'))
  })

  it('closes an object whose last property carries one at the object\'s indent', () => {
    const value = object(builder => {
      builder.object('nested', builder => {
        builder.value('group', ref(42, 'Backend'))
      })
    })
    expect(render(value)).toEqual([
      '{',
      '  nested: {',
      '    group: AlertChannel.fromId(42), // Backend',
      '  },',
      '}',
      '',
    ].join('\n'))
  })

  it('puts the comment after the comma of an array element, for any element', () => {
    const value = object(builder => {
      builder.array('alertChannels', builder => {
        builder.value(ref(7, 'Ops email'))
        builder.value(ident('opsAlert'))
        builder.value(ref(8, 'Pager'))
      })
    })
    expect(render(value)).toEqual([
      '{',
      '  alertChannels: [',
      '    AlertChannel.fromId(7), // Ops email',
      '    opsAlert,',
      '    AlertChannel.fromId(8), // Pager',
      '  ],',
      '}',
      '',
    ].join('\n'))
  })

  it('renders the value alone where no separator follows it', () => {
    expect(render(ref(7, 'Ops email'))).toEqual('AlertChannel.fromId(7)\n')
  })

  it('leaves arrays and objects without one as they were', () => {
    const value = object(builder => {
      builder.array('tags', builder => {
        builder.string('a')
        builder.string('b')
      })
      builder.array('empty', () => {})
    })
    expect(render(value)).toEqual([
      '{',
      '  tags: [',
      '    \'a\',',
      '    \'b\',',
      '  ],',
      '  empty: [],',
      '}',
      '',
    ].join('\n'))
    expect(render(array(() => {}))).toEqual('[]\n')
  })
})

describe('singleLineCommentText', () => {
  it('replaces every kind of line break with a single space', () => {
    expect(singleLineCommentText('Ops\nemail')).toEqual('Ops email')
    expect(singleLineCommentText('Ops \r\n\r\n email')).toEqual('Ops email')
    expect(singleLineCommentText('a b c')).toEqual('a b c')
  })

  it('trims the text and keeps other characters', () => {
    expect(singleLineCommentText('  Backend // team */  ')).toEqual('Backend // team */')
    expect(singleLineCommentText('\n\n')).toEqual('')
  })
})
