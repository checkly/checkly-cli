import { Output } from './output'
import { Value } from './value'

export class Program {
  #imports = new Map<string, string[]>()
  #elements: any[] = []

  import (type: string, from: string) {
    this.#imports.set(from, (this.#imports.get(from) || []).concat([type]))
  }

  value (value: Value) {
    // TODO
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
            output.cosmeticWhitespace()
          }
          first = false
          output.append(type)
        }
        output.cosmeticWhitespace()
        output.append('}')
        output.significantWhitespace()
        output.append(pkg)
      }
    }
  }
}
