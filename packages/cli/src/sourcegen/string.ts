import { inspect } from 'node:util'

import { Output } from './output'
import { Value } from './value'

export class StringValue extends Value {
  value: string

  constructor (value: string) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(quote(this.value))
  }
}

export function quote (value: string): string {
  // Not ideal but for now inspect() works.
  return inspect(value)
}
