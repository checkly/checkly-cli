import { IdentifierValue } from './identifier'
import { Output } from './output'
import { Value } from './value'

export abstract class Declaration {
  abstract render (output: Output): void
}

export class ConstVariableDeclaration extends Declaration {
  identifier: IdentifierValue
  value: Value

  constructor (identifier: IdentifierValue, value: Value) {
    super()
    this.identifier = identifier
    this.value = value
  }

  export (): ExportDeclaration {
    return new ExportDeclaration(this)
  }

  render (output: Output): void {
    output.append('const')
    output.significantWhitespace()
    this.identifier.render(output)
    output.cosmeticWhitespace()
    output.append('=')
    output.cosmeticWhitespace()
    this.value.render(output)
    output.endLine()
  }
}

export function constVariable (identifier: IdentifierValue, value: Value): ConstVariableDeclaration {
  return new ConstVariableDeclaration(identifier, value)
}

export class ExportDeclaration {
  decl: Declaration

  constructor (decl: Declaration) {
    this.decl = decl
  }

  render (output: Output): void {
    output.append('export')
    output.significantWhitespace()
    this.decl.render(output)
  }
}
