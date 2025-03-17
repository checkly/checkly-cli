import { ArgumentsValue, ArgumentsValueBuilder } from './args'
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
    const builder = new ArgumentsValueBuilder()
    build(builder)
    return this.context(new NewExpressionValue(this.#context, builder.build()))
  }

  call (build: (builder: ArgumentsValueBuilder) => void): this {
    const builder = new ArgumentsValueBuilder()
    build(builder)
    return this.context(new CallExpressionValue(this.#context, builder.build()))
  }

  member (property: Value): this {
    return this.context(new MemberExpressionValue(this.#context, property))
  }

  context (value: Value): this {
    this.#context = value
    return this
  }

  build (): Value {
    return this.#context
  }
}
