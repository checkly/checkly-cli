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
  missingFiles: string[] = []
  parseErrors: ParseError[] = []
  unsupportedNpmDependencies: UnsupportedNpmDependencies[] = []
  dependencies = new Set<string>()

  constructor (entrypoint: string) {
    this.entrypoint = entrypoint
  }

  hasDependency (path: string) {
    return this.dependencies.has(path)
  }

  addDependency (path: string) {
    this.dependencies.add(path)
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

  collect () {
    this.dependencies.delete(this.entrypoint)
    return Array.from(this.dependencies)
  }
}
