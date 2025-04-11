import { Output } from './output'
import { Value } from './value'

export class ArrayValue extends Value {
  value: Value[]

  constructor (value: Value[]) {
    super()
    this.value = value
  }

  render (output: Output): void {
    if (this.value.length === 0) {
      output.append('[]')
      return
    }

    output.append('[')
    output.increaseIndent()

    for (const value of this.value) {
      output.endLine()
      value.render(output)
      output.append(',')
    }

    output.decreaseIndent()
    output.endLine()
    output.append(']')
  }
}
