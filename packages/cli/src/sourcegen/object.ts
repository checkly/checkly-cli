import { Output } from './output'
import { Value } from './value'

export class ObjectProperty {
  name: string
  value: Value

  constructor (name: string, value: Value) {
    this.name = name
    this.value = value
  }
}

export class ObjectValue extends Value {
  value: ObjectProperty[] = []

  constructor (value: ObjectProperty[]) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append('{')
    output.increaseIndent()

    for (const { name, value } of this.value) {
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
