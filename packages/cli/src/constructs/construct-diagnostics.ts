import { Construct } from './construct'
import { Diagnostic, Diagnostics, ErrorDiagnostic, WarningDiagnostic } from './diagnostics'

export class InvalidPropertyValueDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Invalid property value`,
      message:
        `The value provided for property "${property}" is not valid.` +
        `\n\n` +
        `Reason: ${error.message}`,
      error,
    })

    this.property = property
  }
}

export class DeprecatedPropertyDiagnostic extends WarningDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Use of deprecated property`,
      message:
        `Property "${property}" is deprecated and will eventually be removed.` +
        `\n\n` +
        `Hint: ${error.message}`,
    })

    this.property = property
  }
}

export class UnsupportedRuntimeFeatureDiagnostic extends ErrorDiagnostic {
  runtimeId: string

  constructor (runtimeId: string, error: Error) {
    super({
      title: `Use of unsupported runtime feature`,
      message:
        `Runtime "${runtimeId}" does not support the requested feature.` +
        `\n\n` +
        `Missing feature: ${error.message}`,
      error,
    })

    this.runtimeId = runtimeId
  }
}

export class ConstructDiagnostic extends Diagnostic {
  underlying: Diagnostic

  constructor (construct: Construct, underlying: Diagnostic) {
    super({
      title: `[${construct.type}:${construct.logicalId}] ${underlying.title}`,
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

export class ConstructDiagnostics extends Diagnostics {
  construct: Construct

  constructor (construct: Construct) {
    super()
    this.construct = construct
  }

  add (diagnostic: Diagnostic): void {
    super.add(new ConstructDiagnostic(this.construct, diagnostic))
  }
}
