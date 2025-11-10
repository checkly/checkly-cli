import path from 'node:path'

export type CoreExtension = '.js' | '.mjs' | '.cjs' | '.json'

export const CoreExtensions: CoreExtension[] = ['.js', '.mjs', '.cjs', '.json']

export function isCoreExtension (value: string): value is CoreExtension {
  return CoreExtensions.includes(value as CoreExtension)
}

type CoreExtensionMapping = {
  [key in CoreExtension]: string[]
}

/**
 * Unlike TypeScript's native lookup order, our lookup order prefers
 * implementation files to declaration files.
 *
 * Why include declaration files at all? Some of our users use manually
 * created declaration files as essentially shared header files without a
 * corresponding implementation file, and the declaration is the only thing
 * we'll be able to find. Otherwise we'd complain about a missing dependency.
 *
 * @see https://www.typescriptlang.org/docs/handbook/modules/reference.html#file-extension-substitution
 */
export const tsCoreExtensionLookupOrder: CoreExtensionMapping = {
  '.js': ['.ts', '.tsx', '.js', '.jsx', '.d.ts'],
  '.mjs': ['.mts', '.mjs', '.d.mts'],
  '.cjs': ['.cts', '.cjs', '.d.cts'],
  '.json': ['.json'],
}

export type TSExtension = '.ts' | '.mts' | '.cts' | '.tsx'

export const TSExtensions: TSExtension[] = ['.ts', '.mts', '.cts', '.tsx']

export function isTSExtension (value: string): value is TSExtension {
  return TSExtensions.includes(value as TSExtension)
}

type TSExtensionMapping = {
  [key in TSExtension]: string[]
}

export const tsExtensionLookupOrder: TSExtensionMapping = {
  '.ts': ['.ts'],
  '.mts': ['.mts'],
  '.cts': ['.cts'],
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
