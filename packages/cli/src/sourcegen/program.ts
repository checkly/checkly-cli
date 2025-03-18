import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'
import { IdentifierValue } from './identifier'

type Content = Declaration | Value

export class Program {
  #imports = new Map<string, string[]>()
  #variables = new Map<string, IdentifierValue>()
  #counters = new Map<string, number>()
  #sections: Content[] = []

  import (type: string, from: string) {
    this.#imports.set(from, (this.#imports.get(from) || []).concat([type]))
  }

  #inc (key: string): number {
    const oldValue = this.#counters.get(key) ?? 0
    const newValue = oldValue + 1
    this.#counters.set(key, newValue)
    return newValue
  }

  nth (key: string): string {
    return `${key}${this.#inc(key)}`
  }

  registerVariable (key: string, identifier: IdentifierValue): IdentifierValue {
    this.#variables.set(key, identifier)
    return identifier
  }

  lookupVariable (key: string): IdentifierValue | undefined {
    return this.#variables.get(key)
  }

  section (content: Content) {
    this.#sections.push(content)
  }

  render (output: Output): void {
    if (this.#imports.size > 0) {
      for (const [pkg, types] of this.#imports.entries()) {
        output.append('import')
        output.cosmeticWhitespace()
        output.append('{')
        let first = true
        for (const type of types) {
          if (!first) {
            output.append(',')
          }
          output.cosmeticWhitespace()
          first = false
          output.append(type)
        }
        output.cosmeticWhitespace()
        output.append('}')
        output.significantWhitespace()
        output.append('from')
        output.significantWhitespace()
        output.append(`'${pkg}'`)
      }
    }

    for (const section of this.#sections) {
      output.endLine()
      output.endLine()
      section.render(output)
    }
  }
}
