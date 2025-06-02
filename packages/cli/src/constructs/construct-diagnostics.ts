import { Construct } from './construct'
import { Diagnostic, Diagnostics, ErrorDiagnostic, WarningDiagnostic } from './diagnostics'

export class InvalidPropertyValueDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Invalid property value`,
      message: `The value provided for property "${property}" is not valid: ${error.message}`,
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
      message: `Property "${property}" is deprecated and will eventually be removed: ${error.message}`,
    })

    this.property = property
  }
}

export class UnsupportedRuntimeFeatureDiagnostic extends ErrorDiagnostic {
  runtimeId: string

  constructor (runtimeId: string, error: Error) {
    super({
      title: `Use of unsupported runtime feature`,
      message: `Unsupported feature on runtime "${runtimeId}": ${error.message}`,
      error,
    })

    this.runtimeId = runtimeId
  }
}

export class ConstructDiagnostic extends Diagnostic {
  underlying: Diagnostic

  constructor (construct: Construct, underlying: Diagnostic) {
    super({
      title: `${underlying.title} in construct "${construct.type}:${construct.logicalId}"`,
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
    this.observations.push(new ConstructDiagnostic(this.construct, diagnostic))
  }
}
