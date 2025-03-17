import { Output } from './output'
import { Value } from './value'

export class StringValue extends Value {
  value: string

  constructor (value: string) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(JSON.stringify(this.value))
  }
}
