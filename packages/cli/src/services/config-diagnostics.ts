import { Diagnostic, Diagnostics } from '../constructs/diagnostics.js'

/**
 * Attributes an underlying diagnostic to the Checkly configuration file it
 * originates from by prefixing the title with the file name.
 */
export class ConfigFileDiagnostic extends Diagnostic {
  underlying: Diagnostic

  constructor (fileName: string, underlying: Diagnostic) {
    super({
      title: `[${fileName}] ${underlying.title}`,
      message: underlying.message,
    })

    this.underlying = underlying
  }

  isFatal (): boolean {
    return this.underlying.isFatal()
  }

  isBenign (): boolean {
    return this.underlying.isBenign()
  }
}

/**
 * A Diagnostics collector that attributes every added diagnostic to a
 * Checkly configuration file.
 */
export class ConfigFileDiagnostics extends Diagnostics {
  fileName: string

  constructor (fileName: string) {
    super()
    this.fileName = fileName
  }

  add (diagnostic: Diagnostic): void {
    super.add(new ConfigFileDiagnostic(this.fileName, diagnostic))
  }
}

/**
 * Thrown when the Checkly configuration file contains fatal diagnostics.
 *
 * The message is composed from the fatal observations so that the error
 * remains readable even when rendered by a generic error handler. Callers
 * that can render diagnostics should prefer the `diagnostics` field.
 */
export class InvalidConfigError extends Error {
  diagnostics: Diagnostics

  constructor (diagnostics: Diagnostics) {
    const fatalObservations = diagnostics.observations.filter(diagnostic => diagnostic.isFatal())
    const message = `Checkly configuration is not valid:`
      + `\n\n`
      + fatalObservations
        .map(diagnostic => `${diagnostic.title}\n\n${diagnostic.message}`)
        .join('\n\n')
    super(message)
    this.name = 'InvalidConfigError'
    this.diagnostics = diagnostics
  }
}
