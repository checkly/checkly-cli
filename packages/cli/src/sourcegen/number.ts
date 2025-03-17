import { Output } from './output'
import { Value } from './value'

export class NumberValue extends Value {
  value: number

  constructor (value: number) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(this.value.toString())
  }
}
