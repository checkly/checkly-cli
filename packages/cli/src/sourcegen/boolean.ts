import { Output } from './output'
import { Value } from './value'

export class BooleanValue extends Value {
  value: boolean

  constructor (value: boolean) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(this.value.toString())
  }
}
