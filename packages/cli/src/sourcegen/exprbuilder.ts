import { ArgumentsValueBuilder } from './argsbuilder'
import { CallExpressionValue, ExpressionValue, MemberExpressionValue, NewExpressionValue } from './expr'
import { Value } from './value'

export function expr (context: Value, build: (builder: ExpressionValueBuilder) => void): ExpressionValue {
  const builder = new ExpressionValueBuilder(context)
  build(builder)
  return builder.build()
}

export class ExpressionValueBuilder {
  #context: Value

  constructor (value: Value) {
    this.#context = value
  }

  new (build: (builder: ArgumentsValueBuilder) => void): this {
    try {
      const builder = new ArgumentsValueBuilder()
      build(builder)
      return this.context(new NewExpressionValue(this.#context, builder.build()))
    } catch (cause) {
      throw new Error(`Failed to create 'new' expression: ${cause}`, { cause })
    }
  }

  call (build: (builder: ArgumentsValueBuilder) => void): this {
    try {
      const builder = new ArgumentsValueBuilder()
      build(builder)
      return this.context(new CallExpressionValue(this.#context, builder.build()))
    } catch (cause) {
      throw new Error(`Failed to create 'call' expression: ${cause}`, { cause })
    }
  }

  member (property: Value): this {
    try {
      return this.context(new MemberExpressionValue(this.#context, property))
    } catch (cause) {
      throw new Error(`Failed to create 'member' expression: ${cause}`, { cause })
    }
  }

  context (value: Value): this {
    this.#context = value
    return this
  }

  build (): Value {
    return this.#context
  }
}
