import { expr, GeneratedFile, ident, Value } from '../sourcegen'
import { Ref } from './ref'

export function valueForRef (genfile: GeneratedFile, ref: Ref): Value {
  genfile.import('Ref', 'checkly/constructs')

  return expr(ident('Ref'), builder => {
    builder.member(ident('from'))
    builder.call(builder => {
      builder.string(ref.ref)
    })
  })
}
