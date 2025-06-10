export interface DiagnosticOptions {
  title: string
  message: string
}

export abstract class Diagnostic {
  title: string
  message: string

  constructor (options: DiagnosticOptions) {
    this.title = options.title
    this.message = options.message
  }

  abstract isFatal (): boolean
  abstract isBenign (): boolean
}

export interface ErrorDiagnosticOptions extends DiagnosticOptions {
  error: any
}

export class ErrorDiagnostic extends Diagnostic {
  error: any

  constructor (options: ErrorDiagnosticOptions) {
    super(options)
    this.error = options.error
  }

  isFatal (): boolean {
    return true
  }

  isBenign (): boolean {
    return false
  }
}

export class WarningDiagnostic extends Diagnostic {
  isFatal (): boolean {
    return false
  }

  isBenign (): boolean {
    return false
  }
}

export class NoticeDiagnostic extends Diagnostic {
  isFatal (): boolean {
    return false
  }

  isBenign (): boolean {
    return true
  }
}

export class Diagnostics {
  observations: Diagnostic[] = []
  #fatal = false
  #benign = true

  isFatal (): boolean {
    return this.#fatal
  }

  isBenign (): boolean {
    return this.#benign
  }

  add (diagnostic: Diagnostic): void {
    this.observations.push(diagnostic)
    this.#fatal ||= diagnostic.isFatal()
    this.#benign &&= diagnostic.isBenign()
  }

  extend (...diagnostics: Diagnostics[]): void {
    for (const diags of diagnostics) {
      for (const observation of diags.observations) {
        this.add(observation)
      }
    }
  }
}
