import { Comment } from './comment'
import { Declaration, IdentifierDeclaration, VariableDeclarationOptions, VariableDeclaration, ExportDeclaration, LeadingCommentDeclaration, TrailingCommentDeclaration } from './decl'
import { IdentifierValue } from './identifier'
import { Value } from './value'

export function decl (identifier: IdentifierValue, build: (builder: DeclarationBuilder) => void): Declaration {
  const builder = new DeclarationBuilder(identifier)
  build(builder)
  return builder.build()
}

export class DeclarationBuilder {
  #identifier: IdentifierValue
  #decl: Declaration

  constructor (identifier: IdentifierValue) {
    this.#identifier = identifier
    this.#decl = new IdentifierDeclaration(identifier)
  }

  variable (value: Value, options?: VariableDeclarationOptions): this {
    this.#decl = new VariableDeclaration(this.#identifier, value, options)
    return this
  }

  export (): this {
    this.#decl = new ExportDeclaration(this.#decl)
    return this
  }

  leadingComment (comment: Comment): this {
    this.#decl = new LeadingCommentDeclaration(comment, this.#decl)
    return this
  }

  trailingComment (comment: Comment): this {
    this.#decl = new TrailingCommentDeclaration(comment, this.#decl)
    return this
  }

  build (): Declaration {
    return this.#decl
  }
}
