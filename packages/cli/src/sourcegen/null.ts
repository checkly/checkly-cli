import { Output } from './output.js'
import { Value } from './value.js'

export class NullValue extends Value {
  render (output: Output): void {
    output.append('null')
  }
}
