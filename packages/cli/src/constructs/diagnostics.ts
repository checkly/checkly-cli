/**
 * Options for creating diagnostic messages.
 */
export interface DiagnosticOptions {
  /** The title/summary of the diagnostic */
  title: string
  /** Detailed message describing the diagnostic */
  message: string
}

/**
 * Abstract base class for diagnostic messages.
 * Diagnostics are used to report issues during validation and processing.
 */
export abstract class Diagnostic {
  /** The title/summary of the diagnostic */
  title: string
  /** Detailed message describing the diagnostic */
  message: string

  /**
   * Creates a new diagnostic instance.
   * @param options The diagnostic configuration
   */
  constructor (options: DiagnosticOptions) {
    this.title = options.title
    this.message = options.message
  }

  /** 
   * Determines if this diagnostic represents a fatal error.
   * @returns true if this diagnostic is fatal and should stop processing
   */
  abstract isFatal (): boolean
  
  /** 
   * Determines if this diagnostic is benign and can be ignored.
   * @returns true if this diagnostic is informational only
   */
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
