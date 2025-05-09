import { Output } from './output'
import { Value } from './value'

export class BooleanValue extends Value {
  value: boolean

  constructor (value: boolean) {
    super()

    if (value === null) {
      throw new Error('Boolean value cannot be null')
    }

    if (value === undefined) {
      throw new Error('Boolean value cannot be undefined')
    }

    this.value = value
  }

  render (output: Output): void {
    output.append(this.value.toString())
  }
}
