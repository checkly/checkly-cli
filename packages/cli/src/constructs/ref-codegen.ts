import { expr, GeneratedFile, ident, Value } from '../sourcegen/index.js'
import { Ref } from './ref.js'

export function valueForRef (genfile: GeneratedFile, ref: Ref): Value {
  genfile.namedImport('Ref', 'checkly/constructs')

  return expr(ident('Ref'), builder => {
    builder.member(ident('from'))
    builder.call(builder => {
      builder.string(ref.ref)
    })
  })
}
