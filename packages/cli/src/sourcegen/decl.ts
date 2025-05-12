import { Comment } from './comment'
import { IdentifierValue } from './identifier'
import { Output } from './output'
import { Value } from './value'

export abstract class Declaration {
  abstract render (output: Output): void
}

export class IdentifierDeclaration extends Declaration {
  identifier: IdentifierValue

  constructor (identifier: IdentifierValue) {
    super()
    this.identifier = identifier
  }

  render (output: Output): void {
    this.identifier.render(output)
  }
}

export interface VariableDeclarationOptions {
  mutable?: boolean
}

export class VariableDeclaration extends Declaration {
  identifier: IdentifierValue
  value: Value
  options?: VariableDeclarationOptions

  constructor (identifier: IdentifierValue, value: Value, options?: VariableDeclarationOptions) {
    super()
    this.identifier = identifier
    this.value = value
    this.options = options
  }

  render (output: Output): void {
    if (this.options?.mutable) {
      output.append('let')
    } else {
      output.append('const')
    }
    output.significantWhitespace()
    this.identifier.render(output)
    output.cosmeticWhitespace()
    output.append('=')
    output.cosmeticWhitespace()
    this.value.render(output)
  }
}

export interface ExportDeclarationOptions {
  default?: boolean
}

export class ExportDeclaration extends Declaration {
  decl: Declaration
  default: boolean

  constructor (decl: Declaration, options?: ExportDeclarationOptions) {
    super()
    this.decl = decl
    this.default = options?.default ?? false
  }

  render (output: Output): void {
    output.append('export')
    output.significantWhitespace()
    if (this.default) {
      output.append('default')
      output.significantWhitespace()
    }
    this.decl.render(output)
  }
}

export class LeadingCommentDeclaration extends Declaration {
  decl: Declaration
  comment: Comment

  constructor (comment: Comment, decl: Declaration) {
    super()
    this.decl = decl
    this.comment = comment
  }

  render (output: Output): void {
    this.comment.render(output)
    output.endLine({
      collapse: true,
    })
    this.decl.render(output)
  }
}

export class TrailingCommentDeclaration extends Declaration {
  decl: Declaration
  comment: Comment

  constructor (comment: Comment, decl: Declaration) {
    super()
    this.decl = decl
    this.comment = comment
  }

  render (output: Output): void {
    this.decl.render(output)
    output.cosmeticWhitespace()
    this.comment.render(output)
  }
}
