import { Output } from './output'
import { Value } from './value'

export class UndefinedValue extends Value {
  render (output: Output): void {
    output.append('undefined')
  }
}
