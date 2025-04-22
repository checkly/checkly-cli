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
    try {
      return this.value(new StringValue(value))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (string): ${cause}`, { cause })
    }
  }

  boolean (value: boolean): this {
    try {
      return this.value(new BooleanValue(value))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (boolean): ${cause}`, { cause })
    }
  }

  number (value: number): this {
    try {
      return this.value(new NumberValue(value))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (number): ${cause}`, { cause })
    }
  }

  null (): this {
    try {
      return this.value(new NullValue())
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (null): ${cause}`, { cause })
    }
  }

  undefined (): this {
    try {
      return this.value(new UndefinedValue())
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (undefined): ${cause}`, { cause })
    }
  }

  ident (value: string): this {
    try {
      return this.value(new IdentifierValue(value))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (identifier): ${cause}`, { cause })
    }
  }

  array (build: (builder: ArrayValueBuilder) => void): this {
    try {
      return this.value(array(build))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (array): ${cause}`, { cause })
    }
  }

  object (build: (builder: ObjectValueBuilder) => void): this {
    try {
      return this.value(object(build))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (object): ${cause}`, { cause })
    }
  }

  expr (context: Value, build: (builder: ExpressionValueBuilder) => void): this {
    try {
      return this.value(expr(context, build))
    } catch (cause) {
      throw new Error(`Failed to add argument #${this.#elements.length} (expr): ${cause}`, { cause })
    }
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
