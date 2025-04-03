import { object, ObjectValueBuilder } from './objectbuilder'
import { ArrayValue } from './array'
import { BooleanValue } from './boolean'
import { NullValue } from './null'
import { NumberValue } from './number'
import { StringValue } from './string'
import { Value } from './value'
import { expr, ExpressionValueBuilder } from './exprbuilder'
import { UndefinedValue } from './undefined'
import { IdentifierValue } from './identifier'

export function array (build: (builder: ArrayValueBuilder) => void): ArrayValue {
  const builder = new ArrayValueBuilder()
  build(builder)
  return builder.build()
}

export class ArrayValueBuilder {
  #elements: Value[] = []

  empty (): this {
    this.#elements = []
    return this
  }

  string (value: string): this {
    return this.value(new StringValue(value))
  }

  boolean (value: boolean): this {
    return this.value(new BooleanValue(value))
  }

  number (value: number): this {
    return this.value(new NumberValue(value))
  }

  null (): this {
    return this.value(new NullValue())
  }

  undefined (): this {
    return this.value(new UndefinedValue())
  }

  ident (value: string): this {
    return this.value(new IdentifierValue(value))
  }

  array (build: (builder: ArrayValueBuilder) => void): this {
    return this.value(array(build))
  }

  object (build: (builder: ObjectValueBuilder) => void): this {
    return this.value(object(build))
  }

  expr (context: Value, build: (builder: ExpressionValueBuilder) => void): this {
    return this.value(expr(context, build))
  }

  value (value: Value): this {
    this.#elements.push(value)
    return this
  }

  get elements (): Value[] {
    return this.#elements
  }

  build (): ArrayValue {
    return new ArrayValue(this.#elements)
  }
}
