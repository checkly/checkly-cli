import { Output } from './output'
import { Value } from './value'

export class IdentifierValue extends Value {
  value: string

  constructor (value: string) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(this.value)
  }
}

export function ident (value: string): IdentifierValue {
  return new IdentifierValue(value)
}
