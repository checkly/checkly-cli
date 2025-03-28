import { ArgumentsValue } from './args'
import { Output } from './output'
import { Value } from './value'

export abstract class ExpressionValue extends Value {
}

export class NewExpressionValue extends ExpressionValue {
  callee: Value
  args: ArgumentsValue

  constructor (callee: Value, args: ArgumentsValue) {
    super()
    this.callee = callee
    this.args = args
  }

  render (output: Output): void {
    output.append('new')
    output.significantWhitespace()
    this.callee.render(output)
    this.args.render(output)
  }
}

export class CallExpressionValue extends ExpressionValue {
  callee: Value
  args: ArgumentsValue

  constructor (callee: Value, args: ArgumentsValue) {
    super()
    this.callee = callee
    this.args = args
  }

  render (output: Output): void {
    this.callee.render(output)
    this.args.render(output)
  }
}

export class MemberExpressionValue extends ExpressionValue {
  object: Value
  property: Value

  constructor (object: Value, property: Value) {
    super()
    this.object = object
    this.property = property
  }

  render (output: Output): void {
    this.object.render(output)
    output.append('.')
    this.property.render(output) // @TODO: . vs ['']
  }
}

type BinaryOperator = '+' | '-' | '&&' | '||'

export class BinaryExpressionValue extends ExpressionValue {
  left: Value
  right: Value
  op: BinaryOperator

  constructor (left: Value, right: Value, op: BinaryOperator) {
    super()
    this.left = left
    this.right = right
    this.op = op
  }

  render (output: Output): void {
    this.left.render(output)
    output.cosmeticWhitespace()
    output.append(this.op)
    output.cosmeticWhitespace()
    this.right.render(output)
  }
}

type UnaryOperator = '!'

export class UnaryExpressionValue extends ExpressionValue {
  value: Value
  op: UnaryOperator

  constructor (value: Value, op: UnaryOperator) {
    super()
    this.value = value
    this.op = op
  }

  render (output: Output): void {
    output.append(this.op)
    this.value.render(output)
  }
}
