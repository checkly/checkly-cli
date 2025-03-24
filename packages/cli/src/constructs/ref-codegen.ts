import { expr, ident, Program, Value } from '../sourcegen'
import { Ref } from './ref'

export function valueForRef (program: Program, ref: Ref): Value {
  program.import('Ref', 'checkly/constructs')

  return expr(ident('Ref'), builder => {
    builder.member(ident('from'))
    builder.call(builder => {
      builder.string(ref.ref)
    })
  })
}
