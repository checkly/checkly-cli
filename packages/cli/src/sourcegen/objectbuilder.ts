import { array, ArrayValueBuilder } from './arraybuilder'
import { BooleanValue } from './boolean'
import { expr, ExpressionValueBuilder } from './exprbuilder'
import { IdentifierValue } from './identifier'
import { NullValue } from './null'
import { NumberValue } from './number'
import { ObjectProperty, ObjectPropertyOptions, ObjectValue, ObjectValueOptions } from './object'
import { StringValue } from './string'
import { UndefinedValue } from './undefined'
import { Value } from './value'

export function object (build: (builder: ObjectValueBuilder) => void, options?: ObjectValueOptions): Value {
  const builder = new ObjectValueBuilder(options)
  build(builder)
  return builder.build()
}

export class ObjectValueBuilder {
  #properties = new Map<string, ObjectProperty>()
  #options?: ObjectValueOptions

  constructor (options?: ObjectValueOptions) {
    this.#options = options
  }

  string (name: string, value: string, options?: ObjectPropertyOptions): this {
    return this.value(name, new StringValue(value), options)
  }

  boolean (name: string, value: boolean, options?: ObjectPropertyOptions): this {
    return this.value(name, new BooleanValue(value), options)
  }

  number (name: string, value: number, options?: ObjectPropertyOptions): this {
    return this.value(name, new NumberValue(value), options)
  }

  null (name: string, options?: ObjectPropertyOptions): this {
    return this.value(name, new NullValue(), options)
  }

  undefined (name: string, options?: ObjectPropertyOptions): this {
    return this.value(name, new UndefinedValue(), options)
  }

  ident (name: string, value: string, options?: ObjectPropertyOptions): this {
    return this.value(name, new IdentifierValue(value), options)
  }

  array (name: string, build: (builder: ArrayValueBuilder) => void, options?: ObjectPropertyOptions): this {
    return this.value(name, array(build), options)
  }

  object (name: string, build: (builder: ObjectValueBuilder) => void, options?: ObjectPropertyOptions): this {
    return this.value(name, object(build), options)
  }

  expr (
    name: string,
    context: Value,
    build: (builder: ExpressionValueBuilder) => void,
    options?: ObjectPropertyOptions,
  ): this {
    return this.value(name, expr(context, build), options)
  }

  value (name: string, value: Value, options?: ObjectPropertyOptions): this {
    this.#properties.set(name, new ObjectProperty(name, value, options))
    return this
  }

  build (): ObjectValue {
    return new ObjectValue([...this.#properties.values()], this.#options)
  }
}
