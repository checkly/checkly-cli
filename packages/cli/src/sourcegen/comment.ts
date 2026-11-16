import { Output } from './output.js'
import { Value } from './value.js'

export interface CommentValueOptions {
  leading?: boolean
  newline?: boolean
}

export class CommentValue extends Value {
  #comment: Comment
  #value: Value
  #leading: boolean
  #newline: boolean

  constructor (comment: Comment, value: Value, options?: CommentValueOptions) {
    super()
    this.#comment = comment
    this.#value = value
    this.#leading = options?.leading ?? false
    this.#newline = options?.newline ?? false
  }

  render (output: Output): void {
    if (this.#leading) {
      this.#comment.render(output)
      if (this.#newline) {
        output.endLine()
      } else {
        output.cosmeticWhitespace()
      }
      this.#value.render(output)
    } else {
      this.#value.render(output)
      if (this.#newline) {
        output.endLine()
      } else {
        output.cosmeticWhitespace()
      }
      this.#comment.render(output)
    }
  }
}

/**
 * A value carrying a line comment that belongs after it, past the comma that
 * separates it from the next element: `AlertChannel.fromId(7), // Ops email`.
 *
 * Only an object property or an array element has such a place, so only
 * `ObjectValue` and `ArrayValue` render the comment. Anywhere else (a call
 * argument, say) the value renders alone, since a line comment there would
 * swallow the rest of the line.
 */
export class TrailingCommentValue extends Value {
  readonly value: Value
  readonly comment: Comment

  constructor (value: Value, comment: Comment) {
    super()
    this.value = value
    this.comment = comment
  }

  render (output: Output): void {
    this.value.render(output)
  }
}

/**
 * Text made safe for a single line comment: a line break (any of the ones
 * JavaScript recognizes) would end the comment and turn the rest of the text
 * into code, so each run of line breaks and the whitespace around it becomes
 * one space.
 */
export function singleLineCommentText (text: string): string {
  return text.replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ').trim()
}

export interface CommentOptions {
  stylized?: boolean
}

export abstract class Comment {
  comment: string
  options: CommentOptions

  constructor (comment: string, options?: CommentOptions) {
    this.comment = comment
    this.options = {
      stylized: true,
      ...options,
    }
  }

  abstract render (output: Output): void
}

export class BlockComment extends Comment {
  render (output: Output): void {
    if (this.options.stylized) {
      const lines = this.comment.split('\n')
      if (lines.length === 1) {
        output.append('/*')
        output.cosmeticWhitespace()
        output.append(this.comment)
        output.cosmeticWhitespace()
        output.append('*/')
      } else {
        output.append('/*')
        output.endLine()
        for (const line of lines) {
          output.append(line)
          output.endLine()
        }
        output.append('*/')
      }
    } else {
      output.append('/*')
      output.append(this.comment)
      output.append('*/')
    }
  }
}

export function blockComment (comment: string, options?: CommentOptions): Comment {
  return new BlockComment(comment, options)
}

export class LineComment extends Comment {
  render (output: Output): void {
    const lines = this.comment.split('\n')
    for (const line of lines) {
      output.append('//')
      if (this.options.stylized) {
        if (line.length !== 0) {
          output.cosmeticWhitespace()
        }
      }
      output.append(line)
      output.endLine()
    }
  }
}

export function lineComment (comment: string, options?: CommentOptions): Comment {
  return new LineComment(comment, options)
}

export class DocComment extends Comment {
  render (output: Output): void {
    const lines = this.comment.split('\n')
    output.append('/**')
    output.endLine()
    for (const line of lines) {
      output.append(' * ')
      output.append(line)
      output.endLine()
    }
    output.append(' */')
  }
}

export function docComment (comment: string, options?: CommentOptions): Comment {
  return new DocComment(comment, options)
}
