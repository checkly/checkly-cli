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

export class ExportDeclaration extends Declaration {
  decl: Declaration

  constructor (decl: Declaration) {
    super()
    this.decl = decl
  }

  render (output: Output): void {
    output.append('export')
    output.significantWhitespace()
    this.decl.render(output)
  }
}
