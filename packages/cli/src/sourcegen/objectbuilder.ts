import { array, ArrayValueBuilder } from './arraybuilder'
import { BooleanValue } from './boolean'
import { expr, ExpressionValueBuilder } from './exprbuilder'
import { IdentifierValue } from './identifier'
import { NullValue } from './null'
import { NumberValue } from './number'
import { ObjectProperty, ObjectValue } from './object'
import { StringValue } from './string'
import { UndefinedValue } from './undefined'
import { Value } from './value'

export function object (build: (builder: ObjectValueBuilder) => void): Value {
  const builder = new ObjectValueBuilder()
  build(builder)
  return builder.build()
}

export class ObjectValueBuilder {
  #properties: ObjectProperty[] = []

  string (name: string, value: string): this {
    return this.value(name, new StringValue(value))
  }

  boolean (name: string, value: boolean): this {
    return this.value(name, new BooleanValue(value))
  }

  number (name: string, value: number): this {
    return this.value(name, new NumberValue(value))
  }

  null (name: string): this {
    return this.value(name, new NullValue())
  }

  undefined (name: string): this {
    return this.value(name, new UndefinedValue())
  }

  ident (name: string, value: string): this {
    return this.value(name, new IdentifierValue(value))
  }

  array (name: string, build: (builder: ArrayValueBuilder) => void): this {
    return this.value(name, array(build))
  }

  object (name: string, build: (builder: ObjectValueBuilder) => void): this {
    return this.value(name, object(build))
  }

  expr (name: string, context: Value, build: (builder: ExpressionValueBuilder) => void): this {
    return this.value(name, expr(context, build))
  }

  value (name: string, value: Value): this {
    this.#properties.push(new ObjectProperty(name, value))
    return this
  }

  build (): ObjectValue {
    return new ObjectValue(this.#properties)
  }
}
