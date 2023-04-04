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
      if (unsupportedNpmDependencies.some(d => d.unsupportedDependencies.some(ud => ud === '@checkly/cli/constructs'))) {
        message += '\n\nIt looks like you\'re trying to use @checkly/cli/constructs in a browser check file. ' +
          '@checkly/cli/constructs should only be used in check files: files ending in .check.ts and .check.js, ' +
          'or the checkMatch pattern set in your configuration. For more information see on the difference between ' +
          'test files and check files, see https://www.checklyhq.com/docs/cli/\n'
      } else {
        message += '\n\nThe following NPM dependencies were used, but aren\'t supported in the runtimes.\n'
        message += 'For more information, see https://www.checklyhq.com/docs/runtimes/.\n'
        for (const { file, unsupportedDependencies } of unsupportedNpmDependencies) {
          message += `\t${file} imports unsupported dependencies:\n`
          for (const unsupportedDependency of unsupportedDependencies) {
            message += `\t\t${unsupportedDependency}\n`
          }
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
