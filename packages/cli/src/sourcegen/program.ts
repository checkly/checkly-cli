import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'

type Content = Declaration | Value

export interface ProgramOptions {
  rootDirectory: string
  constructFileSuffix: string
  language: 'typescript' | 'javascript'
}

export interface GeneratedFileOptions {
  type: 'construct' | 'auxiliary'
}

export class Program {
  #options: ProgramOptions
  #generatedFiles = new Map<string, GeneratedFile>()
  #staticAuxiliaryFiles = new Map<string, StaticAuxiliaryFile>()

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

    for (const file of this.#staticAuxiliaryFiles.values()) {
      paths.push(path.join(this.#options.rootDirectory, file.path))
    }

    paths.sort()

    return paths
  }

  generatedFile (path: string, options?: GeneratedFileOptions): GeneratedFile {
    const type = options?.type ?? 'construct'
    if (type === 'construct') {
      path += this.#options.constructFileSuffix
    }

    switch (this.#options.language) {
      case 'typescript':
        path += '.ts'
        break
      case 'javascript':
        path += '.js'
        break
      default:
        throw new Error(`Unknown value '${this.#options.language}' for \`ProgramOptions.language\``)
    }

    let file = this.#generatedFiles.get(path)
    if (file === undefined) {
      file = new GeneratedFile(path)
      this.#generatedFiles.set(path, file)
    }

    return file
  }

  async realize (): Promise<void> {
    for (const file of this.#generatedFiles.values()) {
      const fullFilePath = path.join(this.#options.rootDirectory, file.path)
      const { dir: fileDir } = path.parse(fullFilePath)

      if (fileDir !== '') {
        await mkdir(fileDir, {
          recursive: true,
        })
      }

      const output = new Output()
      file.render(output)

      await writeFile(fullFilePath, output.finalize())
    }

    for (const file of this.#staticAuxiliaryFiles.values()) {
      const fullFilePath = path.join(this.#options.rootDirectory, file.path)
      const { dir: fileDir } = path.parse(fullFilePath)

      if (fileDir !== '') {
        await mkdir(fileDir, {
          recursive: true,
        })
      }

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
  relativeToSelf?: boolean
}

export class GeneratedFile extends ProgramFile {
  #imports = new Map<string, Set<string>>()
  #sections: Content[] = []

  import (type: string, from: string, options?: ImportOptions) {
    let relativeTo = options?.relativeTo
    if (relativeTo === undefined && options?.relativeToSelf) {
      relativeTo = path.dirname(this.path)
    }
    if (relativeTo !== undefined) {
      from = path.relative(relativeTo, from)
      if (!from.startsWith('.')) {
        from = `./${from}`
      }

      // Attempt to make sure we create a posix path.
      from = from.replace(/\\/g, '/')
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

export class StaticAuxiliaryFile extends ProgramFile {
  readonly content: string | Buffer

  constructor (path: string, content: string | Buffer) {
    super(path)

    this.content = content
  }
}
