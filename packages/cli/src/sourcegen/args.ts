import { Output } from './output.js'
import { Value } from './value.js'

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
