import { ParseError, UnsupportedNpmDependencies } from './collector'

export class DependencyParseError extends Error {
  entrypoint: string
  missingFiles: string[]
  unsupportedNpmDependencies: UnsupportedNpmDependencies[]
  parseErrors: ParseError[]
  constructor (
    entrypoint: string,
    missingFiles: string[],
    unsupportedNpmDependencies: UnsupportedNpmDependencies[],
    parseErrors: ParseError[],
  ) {
    let message = `Encountered an error parsing check files for ${entrypoint}.`
    if (missingFiles.length) {
      message += '\n\nThe following dependencies weren\'t found:\n'
      for (const missingFile of missingFiles) {
        message += `\t${missingFile}\n`
      }
    }
    if (unsupportedNpmDependencies.length) {
      message += '\n\nThe following NPM dependencies were used, but aren\'t supported in the runtimes.\n'
      message += 'For more information, see https://www.checklyhq.com/docs/runtimes/.\n'
      for (const { file, unsupportedDependencies } of unsupportedNpmDependencies) {
        message += `\t${file} imports unsupported dependencies:\n`
        for (const unsupportedDependency of unsupportedDependencies) {
          message += `\t\t${unsupportedDependency}\n`
        }
      }
    }
    if (parseErrors.length) {
      message += '\n\nThe following files couldn\'t be parsed:\n'
      for (const { file, error } of parseErrors) {
        message += `\t${file} - ${error}\n`
      }
    }
    super(message)
    this.entrypoint = entrypoint
    this.missingFiles = missingFiles
    this.unsupportedNpmDependencies = unsupportedNpmDependencies
    this.parseErrors = parseErrors
  }
}
