import { Output } from './output'
import { Value } from './value'

export class NullValue extends Value {
  render (output: Output): void {
    output.append('null')
  }
}
