import { Output } from './output'
import { Value } from './value'

export class ArgumentsValue extends Value {
  value: Value[]

  constructor (value: Value[]) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append('(')

    let first = true
    for (const value of this.value) {
      if (!first) {
        output.append(',')
        output.cosmeticWhitespace()
      }
      first = false
      value.render(output)
    }

    output.append(')')
  }
}
