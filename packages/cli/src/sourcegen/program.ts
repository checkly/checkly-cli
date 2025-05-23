import { mkdir, writeFile } from 'node:fs/promises'
import path, { extname } from 'node:path'

import { Comment } from './comment'
import { Output } from './output'
import { Value } from './value'
import { Declaration } from './decl'

type Content = Comment | Declaration | Value

type Header = Comment

export interface ProgramOptions {
  rootDirectory: string
  constructFileSuffix: string
  constructHeaders?: Header[]
  specFileSuffix: string
  language: 'typescript' | 'javascript'
}

export class Program {
  #options: ProgramOptions
  #ext: string
  #generatedFiles = new Map<string, GeneratedFile>()
  #staticAuxiliaryFiles = new Map<string, StaticAuxiliaryFile>()

  constructor (options: ProgramOptions) {
    this.#options = {
      ...options,
    }

    switch (options.language) {
      case 'typescript':
        this.#ext = '.ts'
        break
      case 'javascript':
        this.#ext = '.js'
        break
      default:
        throw new Error(`Unknown value '${options.language}' for \`ProgramOptions.language\``)
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

  generatedConstructFile (path: string): GeneratedFile {
    if (this.#shouldModifyPath(path)) {
      path += this.#options.constructFileSuffix
      path += this.#ext
    }

    let file = this.#generatedFiles.get(path)
    if (file === undefined) {
      file = new GeneratedFile(path)
      for (const header of this.#options.constructHeaders ?? []) {
        file.header(header)
      }
      this.#generatedFiles.set(path, file)
    }

    return file
  }

  generatedSupportFile (path: string): GeneratedFile {
    if (this.#shouldModifyPath(path)) {
      path += this.#ext
    }

    let file = this.#generatedFiles.get(path)
    if (file === undefined) {
      file = new GeneratedFile(path)
      this.#generatedFiles.set(path, file)
    }

    return file
  }

  staticSpecFile (path: string, content: string | Buffer): StaticAuxiliaryFile {
    if (this.#shouldModifyPath(path)) {
      path += this.#options.specFileSuffix
      path += this.#ext
    }
    const file = new StaticAuxiliaryFile(path, content)
    this.#staticAuxiliaryFiles.set(path, file)
    return file
  }

  staticStyleFile (path: string, content: string | Buffer): StaticAuxiliaryFile {
    if (this.#shouldModifyPath(path)) {
      path += '.css'
    }
    const file = new StaticAuxiliaryFile(path, content)
    this.#staticAuxiliaryFiles.set(path, file)
    return file
  }

  staticSupportFile (path: string, content: string | Buffer): StaticAuxiliaryFile {
    if (this.#shouldModifyPath(path)) {
      path += this.#ext
    }
    const file = new StaticAuxiliaryFile(path, content)
    this.#staticAuxiliaryFiles.set(path, file)
    return file
  }

  #shouldModifyPath (path: string): boolean {
    // Don't add extensions if it looks like we already have some.
    return extname(path) === ''
  }

  async realize (): Promise<void> {
    for (const file of this.#generatedFiles.values()) {
      const fullFilePath = path.resolve(this.#options.rootDirectory, file.path)
      const { dir: fileDir } = path.parse(fullFilePath)

      if (fileDir !== '') {
        await mkdir(fileDir, {
          recursive: true,
        })
      }

      const output = new Output()
      try {
        file.render(output)
      } catch (cause) {
        throw new Error(`Failed to render output file '${fullFilePath}': ${cause}`, { cause })
      }

      await writeFile(fullFilePath, output.finalize())
    }

    for (const file of this.#staticAuxiliaryFiles.values()) {
      const fullFilePath = path.resolve(this.#options.rootDirectory, file.path)
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

  get dirname (): string {
    return path.dirname(this.path)
  }

  get basename (): string {
    return path.basename(this.path)
  }

  relativePath (to: ProgramFile): string {
    let relpath = path.relative(this.dirname, to.path)
    if (!relpath.startsWith('.')) {
      relpath = `./${relpath}`
    }
    return posixPath(relpath)
  }
}

function posixPath (path: string): string {
  return path.replace(/\\/g, '/')
}

export interface ImportOptions {
  relativeTo?: string
  relativeToSelf?: boolean
  alias?: string
}

export interface NamedImport {
  identifier: string
  alias?: string
}

function sortNamedImports (imports: NamedImport[]): NamedImport[] {
  return Array.from(imports).sort((a, b) => {
    const valueA = [a.identifier, a.alias].join(', ')
    const valueB = [b.identifier, b.alias].join(', ')
    return valueA.localeCompare(valueB)
  })
}

export class GeneratedFile extends ProgramFile {
  #namedImports = new Map<string, NamedImport[]>()
  #plainImports = new Set<string>()
  #sections: Content[] = []
  #headers: Header[] = []

  namedImport (identifier: string, from: string, options?: ImportOptions) {
    from = this.#processImportFrom(from, options)

    const namedImports = this.#namedImports.get(from) ?? []

    for (const namedImport of namedImports) {
      if (namedImport.identifier === identifier && namedImport.alias === options?.alias) {
        // Already imported.
        return
      }
    }

    namedImports.push({
      identifier,
      alias: options?.alias,
    })

    this.#namedImports.set(from, namedImports)
  }

  plainImport (from: string, options?: ImportOptions) {
    from = this.#processImportFrom(from, options)

    this.#plainImports.add(from)
  }

  #processImportFrom (from: string, options?: ImportOptions): string {
    let relativeTo = options?.relativeTo
    if (relativeTo === undefined && options?.relativeToSelf) {
      relativeTo = path.dirname(this.path)
    }
    if (relativeTo !== undefined) {
      from = path.relative(relativeTo, from)
      if (!from.startsWith('.')) {
        from = `./${from}`
      }

      from = posixPath(from)
    }

    // Shouldn't have imports with .ts extensions.
    if (from.endsWith('.ts') || from.endsWith('.js')) {
      from = from.slice(0, -3)
    }

    return from
  }

  header (header: Header) {
    this.#headers.push(header)
  }

  section (content: Content) {
    this.#sections.push(content)
  }

  render (output: Output): void {
    for (const header of this.#headers) {
      header.render(output)
      output.endLine()
      output.endLine()
    }

    if (this.#namedImports.size > 0) {
      for (const [pkg, imports] of this.#namedImports.entries()) {
        output.append('import')
        output.cosmeticWhitespace()
        output.append('{')
        let first = true
        for (const { identifier, alias } of sortNamedImports(imports)) {
          if (!first) {
            output.append(',')
          }
          output.cosmeticWhitespace()
          first = false
          output.append(identifier)
          if (alias !== undefined) {
            output.significantWhitespace()
            output.append('as')
            output.significantWhitespace()
            output.append(alias)
          }
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

    if (this.#plainImports.size > 0) {
      for (const pkg of this.#plainImports.values()) {
        output.append('import')
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
