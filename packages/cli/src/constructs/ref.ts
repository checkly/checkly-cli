import { expr, ident, Program, Value } from '../sourcegen'

export class Ref {
  ref: string
  private constructor (ref: string) {
    this.ref = ref
  }

  static from (ref: string) {
    return new Ref(ref)
  }
}

export function sourceForRef (program: Program, ref: Ref): Value {
  program.import('Ref', 'checkly/constructs')

  return expr(ident('Ref'), builder => {
    builder.member(ident('from'))
    builder.call(builder => {
      builder.string(ref.ref)
    })
  })
}
