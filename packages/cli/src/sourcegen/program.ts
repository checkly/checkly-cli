import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'

type Content = Declaration | Value

export interface ProgramOptions {
  rootDirectory: string
  ext: string
}

export class Program {
  #options: ProgramOptions
  #generatedFiles = new Map<string, GeneratedFile>()
  #auxiliaryFile = new Map<string, AuxiliaryFile>()

  constructor (options: ProgramOptions) {
    this.#options = {
      ...options,
    }
  }

  get paths () {
    const paths = []

    for (const file of this.#generatedFiles.values()) {
      paths.push(path.join(this.#options.rootDirectory, file.path))
    }

    for (const file of this.#auxiliaryFile.values()) {
      paths.push(path.join(this.#options.rootDirectory, file.path))
    }

    paths.sort()

    return paths
  }

  generatedFile (path: string): GeneratedFile {
    const extPath = path + this.#options.ext
    let file = this.#generatedFiles.get(extPath)
    if (file === undefined) {
      file = new GeneratedFile(extPath)
      this.#generatedFiles.set(extPath, file)
    }
    return file
  }

  async realize (): Promise<void> {
    for (const file of this.#generatedFiles.values()) {
      const fullFilePath = path.join(this.#options.rootDirectory, file.path)
      const { dir: fileDir } = path.parse(fullFilePath)

      await mkdir(fileDir, {
        recursive: true,
      })

      const output = new Output()
      file.render(output)

      await writeFile(fullFilePath, output.finalize())
    }

    for (const file of this.#auxiliaryFile.values()) {
      const fullFilePath = path.join(this.#options.rootDirectory, file.path)
      const { dir: fileDir } = path.parse(fullFilePath)

      await mkdir(fileDir, {
        recursive: true,
      })

      await writeFile(fullFilePath, file.content)
    }
  }
}

export abstract class ProgramFile {
  readonly path: string

  constructor (path: string) {
    this.path = path
  }
}

export interface ImportOptions {
  relativeTo?: string
}

export class GeneratedFile extends ProgramFile {
  #imports = new Map<string, Set<string>>()
  #sections: Content[] = []

  import (type: string, from: string, options?: ImportOptions) {
    if (options?.relativeTo !== undefined) {
      from = path.posix.relative(options.relativeTo, from)
      if (!from.startsWith('.')) {
        from = `./${from}`
      }
    }

    // Shouldn't have imports with .ts extensions.
    if (from.endsWith('.ts')) {
      from = from.slice(0, -3) + '.js'
    }

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
        output.endLine()
      }
    }

    for (const section of this.#sections) {
      output.endLine()
      section.render(output)
      output.endLine()
    }
  }
}

export class AuxiliaryFile extends ProgramFile {
  readonly content: string | Buffer

  constructor (path: string, content: string | Buffer) {
    super(path)

    this.content = content
  }
}
