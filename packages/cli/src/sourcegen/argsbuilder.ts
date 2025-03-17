import { ArgumentsValue } from './args'
import { ArrayValueBuilder, array } from './arraybuilder'
import { BooleanValue } from './boolean'
import { ExpressionValueBuilder, expr } from './exprbuilder'
import { IdentifierValue } from './identifier'
import { NullValue } from './null'
import { NumberValue } from './number'
import { ObjectValueBuilder, object } from './objectbuilder'
import { StringValue } from './string'
import { UndefinedValue } from './undefined'
import { Value } from './value'

export function args (build: (builder: ArgumentsValueBuilder) => void): ArgumentsValue {
  const builder = new ArgumentsValueBuilder()
  build(builder)
  return builder.build()
}

// Avoid extending ArrayValueBuilder due to circular dependencies.
export class ArgumentsValueBuilder {
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

  build (): ArgumentsValue {
    return new ArgumentsValue(this.#elements)
  }
}
