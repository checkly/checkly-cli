import { Output } from './output'
import { Value } from './value'

export class NumberValue extends Value {
  value: number

  constructor (value: number) {
    super()

    if (value === null) {
      throw new Error('Number value cannot be null')
    }

    if (value === undefined) {
      throw new Error('Number value cannot be undefined')
    }

    this.value = value
  }

  render (output: Output): void {
    output.append(this.value.toString())
  }
}
