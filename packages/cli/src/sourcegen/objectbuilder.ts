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

export interface ObjectValueBuilderOptions extends ObjectValueOptions {
  implicitOrder?: boolean
  implicitOrderStart?: number
  implicitOrderStep?: number
}

export function object (build: (builder: ObjectValueBuilder) => void, options?: ObjectValueBuilderOptions): ObjectValue {
  const builder = new ObjectValueBuilder(options)
  build(builder)
  return builder.build()
}

export class ObjectValueBuilder {
  #properties = new Map<string, ObjectProperty>()
  #valueOptions?: ObjectValueOptions
  #implicitOrder = true
  #implicitOrderValue = 0
  #implicitOrderStep = 100

  constructor (options?: ObjectValueBuilderOptions) {
    this.#valueOptions = {
      ...options,
    }

    if (options?.implicitOrder !== undefined) {
      this.#implicitOrder = options.implicitOrder
    }

    if (options?.implicitOrderStart !== undefined) {
      this.#implicitOrderValue = options.implicitOrderStart
    }

    if (options?.implicitOrderStep !== undefined) {
      this.#implicitOrderStep = options.implicitOrderStep
    }
  }

  string (name: string, value: string, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new StringValue(value), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (string): ${cause}`, { cause })
    }
  }

  boolean (name: string, value: boolean, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new BooleanValue(value), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (boolean): ${cause}`, { cause })
    }
  }

  number (name: string, value: number, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new NumberValue(value), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (number): ${cause}`, { cause })
    }
  }

  null (name: string, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new NullValue(), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (null): ${cause}`, { cause })
    }
  }

  undefined (name: string, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new UndefinedValue(), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (undefined): ${cause}`, { cause })
    }
  }

  ident (name: string, value: string, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, new IdentifierValue(value), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (identifier): ${cause}`, { cause })
    }
  }

  array (name: string, build: (builder: ArrayValueBuilder) => void, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, array(build), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (array): ${cause}`, { cause })
    }
  }

  object (name: string, build: (builder: ObjectValueBuilder) => void, options?: ObjectPropertyOptions): this {
    try {
      return this.value(name, object(build), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (object): ${cause}`, { cause })
    }
  }

  expr (
    name: string,
    context: Value,
    build: (builder: ExpressionValueBuilder) => void,
    options?: ObjectPropertyOptions,
  ): this {
    try {
      return this.value(name, expr(context, build), options)
    } catch (cause) {
      throw new Error(`Failed to set object property '${name}' (expr): ${cause}`, { cause })
    }
  }

  value (name: string, value: Value, options?: ObjectPropertyOptions): this {
    if (options?.order === undefined && this.#implicitOrder) {
      options = {
        ...options,
        order: this.#implicitOrderValue,
      }

      this.#implicitOrderValue += this.#implicitOrderStep
    }

    this.#properties.set(name, new ObjectProperty(name, value, options))

    return this
  }

  build (): ObjectValue {
    return new ObjectValue([...this.#properties.values()], this.#valueOptions)
  }
}
