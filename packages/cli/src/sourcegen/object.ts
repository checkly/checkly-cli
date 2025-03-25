import { Output } from './output'
import { Value } from './value'

export interface ObjectPropertyOptions {
  order?: number
}

export class ObjectProperty {
  name: string
  value: Value
  options?: ObjectPropertyOptions

  constructor (name: string, value: Value, options?: ObjectPropertyOptions) {
    this.name = name
    this.value = value
    this.options = options
  }
}

export type ObjectPropertySorter = (a: ObjectProperty, b: ObjectProperty) => number

export interface ObjectValueOptions {
  sort?: ObjectPropertySorter
}

export function sortObjectPropertiesByName (a: ObjectProperty, b: ObjectProperty): number {
  if (a.name < b.name) {
    return -1
  }

  if (a.name > b.name) {
    return 1
  }

  return 0
}

export function sortObjectPropertiesByOrder (a: ObjectProperty, b: ObjectProperty): number {
  const orderA = (a.options?.order ?? 0)
  const orderB = (b.options?.order ?? 0)

  if (orderA < orderB) {
    return -1
  }

  if (orderA > orderB) {
    return 1
  }

  return 0
}

export function sortObjectPropertiesByOrderAndName (a: ObjectProperty, b: ObjectProperty): number {
  const result = sortObjectPropertiesByOrder(a, b)
  return result === 0 ? sortObjectPropertiesByName(a, b) : result
}

export class ObjectValue extends Value {
  value: ObjectProperty[] = []
  options?: ObjectValueOptions

  constructor (value: ObjectProperty[], options?: ObjectValueOptions) {
    super()
    this.value = value
    this.options = options
  }

  render (output: Output): void {
    const sorter = this.options?.sort ?? sortObjectPropertiesByOrderAndName
    const properties = [...this.value].sort(sorter)

    output.append('{')
    output.increaseIndent()

    for (const { name, value } of properties) {
      output.endLine()
      output.append(name)
      output.append(':')
      output.cosmeticWhitespace()
      value.render(output)
      output.append(',')
    }

    output.decreaseIndent()
    output.endLine()
    output.append('}')
  }
}
