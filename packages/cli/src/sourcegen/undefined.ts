import { Output } from './output.js'
import { Value } from './value.js'

export class UndefinedValue extends Value {
  render (output: Output): void {
    output.append('undefined')
  }
}
