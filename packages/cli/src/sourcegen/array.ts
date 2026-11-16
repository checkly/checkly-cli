import { TrailingCommentValue } from './comment.js'
import { Output } from './output.js'
import { Value } from './value.js'

export class ArrayValue extends Value {
  value: Value[]

  constructor (value: Value[]) {
    super()
    this.value = value
  }

  isEmpty (): boolean {
    return this.value.length === 0
  }

  render (output: Output): void {
    if (this.value.length === 0) {
      output.append('[]')
      return
    }

    output.append('[')
    output.increaseIndent()

    for (const value of this.value) {
      // A trailing line comment has ended the previous line already.
      output.endLine({ collapse: true })
      value.render(output)
      output.append(',')
      if (value instanceof TrailingCommentValue) {
        output.cosmeticWhitespace()
        value.comment.render(output)
      }
    }

    output.decreaseIndent()
    output.endLine({ collapse: true })
    output.append(']')
  }
}
