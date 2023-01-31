import { DependencyParseError } from './errors'

export type UnsupportedNpmDependencies = {
  file: string;
  unsupportedDependencies: string[];
}

export type ParseError = {
  file: string;
  error: string;
}

export class Collector {
  entrypoint: string
  entrypointContent: string
  missingFiles: string[] = []
  parseErrors: ParseError[] = []
  unsupportedNpmDependencies: UnsupportedNpmDependencies[] = []
  dependencies = new Map<string, string>()

  constructor (entrypoint: string, entrypointContent: string) {
    this.entrypoint = entrypoint
    this.entrypointContent = entrypointContent
  }

  hasDependency (path: string) {
    return this.dependencies.has(path)
  }

  addDependency (path: string, content: string) {
    this.dependencies.set(path, content)
  }

  addUnsupportedNpmDependencies (file: string, unsupportedDependencies: string[]) {
    this.unsupportedNpmDependencies.push({ file, unsupportedDependencies })
  }

  addParsingError (file: string, message: string) {
    this.parseErrors.push({ file, error: message })
  }

  addMissingFile (filePath: string) {
    this.missingFiles.push(filePath)
  }

  validate () {
    if (this.missingFiles.length || this.parseErrors.length || this.unsupportedNpmDependencies.length) {
      throw new DependencyParseError(
        this.entrypoint,
        this.missingFiles,
        this.unsupportedNpmDependencies,
        this.parseErrors,
      )
    }
  }

  getItems () {
    return {
      entrypoint: {
        filePath: this.entrypoint,
        content: this.entrypointContent,
      },
      dependencies: Array.from(this.dependencies.entries(), ([key, value]) => ({
        filePath: key,
        content: value,
      })),
    }
  }
}
