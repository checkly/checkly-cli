import { Output } from './output'
import { Value } from './value'
import { cased, CaseFormat } from './case'

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

export interface IdentOptions {
  format?: CaseFormat
}

export function ident (value: string, options?: IdentOptions): IdentifierValue {
  const format = options?.format
  if (format !== undefined) {
    value = cased(value, format)
  }

  // Get rid of any leading digits.
  value = value.replace(/^[0-9]+/, '')

  return new IdentifierValue(value)
}
