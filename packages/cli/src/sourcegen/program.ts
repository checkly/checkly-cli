import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'

type Content = Declaration | Value

export class Program {
  #imports = new Map<string, Set<string>>()
  #sections: Content[] = []

  import (type: string, from: string) {
    if (this.#imports.has(from)) {
      this.#imports.get(from)?.add(type)
    } else {
      this.#imports.set(from, new Set([type]))
    }
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
        for (const type of Array.from(types).sort()) {
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
