import { ArrayValue } from './array'
import { ArrayValueBuilder } from './arraybuilder'
import { Output } from './output'
import { Value } from './value'

export function args (build: (builder: ArgumentsValueBuilder) => void): ArgumentsValue {
  const builder = new ArgumentsValueBuilder()
  build(builder)
  return builder.build()
}

export class ArgumentsValue extends ArrayValue {
  render (output: Output): void {
    output.append('(')
    output.increaseIndent()

    for (const value of this.value) {
      output.beginLine()
      value.render(output)
      output.append(',')
    }

    output.decreaseIndent()
    output.beginLine()
    output.append(')')
  }
}

export class ArgumentsValueBuilder extends ArrayValueBuilder {
  build (): ArgumentsValue {
    return new ArgumentsValue(super.elements)
  }
}
