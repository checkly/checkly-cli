import path from 'node:path'

export type CoreExtension = '.js' | '.mjs' | '.cjs' | '.json'

export const CoreExtensions: CoreExtension[] = ['.js', '.mjs', '.cjs', '.json']

type CoreExtensionMapping = {
  [key in CoreExtension]: string[]
}

/**
 * @see https://www.typescriptlang.org/docs/handbook/modules/reference.html#file-extension-substitution
 */
export const tsCoreExtensionLookupOrder: CoreExtensionMapping = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '.json': ['.json'],
}

export type TSExtension = '.ts' | '.mts' | '.tsx'

export const TSExtensions: TSExtension[] = ['.ts', '.mts', '.tsx']

type TSExtensionMapping = {
  [key in TSExtension]: string[]
}

export const tsExtensionLookupOrder: TSExtensionMapping = {
  '.ts': ['.ts'],
  '.mts': ['.mts'],
  '.tsx': ['.tsx'],
}

function stripKnownSuffix (value: string, suffix: string): string {
  return value.substring(0, value.length - suffix.length)
}

export class FileExtPath {
  filePath: string
  ext: string

  private constructor (filePath: string, ext: string) {
    this.filePath = filePath
    this.ext = ext
  }

  static fromFilePath (filePath: string) {
    const ext = path.extname(filePath)
    return new FileExtPath(filePath, ext)
  }

  hasCoreExtension () {
    return this.ext in tsCoreExtensionLookupOrder
  }

  hasTypeScriptExtension () {
    return this.ext in tsExtensionLookupOrder
  }

  replaceExt (ext: string) {
    return stripKnownSuffix(this.filePath, this.ext) + ext
  }

  appendExt (ext: string) {
    return this.filePath + ext
  }

  resolve (...paths: string[]) {
    return path.resolve(this.filePath, ...paths)
  }

  self () {
    return this.filePath
  }
}
