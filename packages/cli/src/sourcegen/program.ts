import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'

type Content = Declaration | Value

export class Program {
  #imports = new Map<string, string[]>()
  #sections: Content[] = []

  import (type: string, from: string) {
    this.#imports.set(from, (this.#imports.get(from) || []).concat([type]))
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
