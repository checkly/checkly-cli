import { Construct } from './construct'
import { Diagnostic, Diagnostics, ErrorDiagnostic, WarningDiagnostic } from './diagnostics'

export class InvalidPropertyValueDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Invalid property value`,
      message:
        `The value provided for property "${property}" is not valid.`
        + `\n\n`
        + `Reason: ${error.message}`,
      error,
    })

    this.property = property
  }
}

export class RequiredPropertyDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Missing required property`,
      message:
        `Property "${property}" is required and must be set.`
        + `\n\n`
        + `Reason: ${error.message}`,
      error,
    })

    this.property = property
  }
}

export class ConflictingPropertyDiagnostic extends ErrorDiagnostic {
  property1: string
  property2: string

  constructor (property1: string, property2: string, error: Error) {
    super({
      title: `Conflicting property`,
      message:
        `Property "${property1}" cannot be set when "${property2}" is set.`
        + `\n\n`
        + `Hint: ${error.message}`,
      error,
    })

    this.property1 = property1
    this.property2 = property2
  }
}

export class DeprecatedPropertyDiagnostic extends WarningDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Use of deprecated property`,
      message:
        `Property "${property}" is deprecated and will eventually be removed.`
        + `\n\n`
        + `Hint: ${error.message}`,
    })

    this.property = property
  }
}

export class RemovedPropertyDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Use of removed property`,
      message:
        `Property "${property}" has been removed.`
        + `\n\n`
        + `Hint: ${error.message}`,
      error,
    })

    this.property = property
  }
}

export class UnsupportedPropertyDiagnostic extends ErrorDiagnostic {
  property: string

  constructor (property: string, error: Error) {
    super({
      title: `Use of unsupported property`,
      message:
        `Property "${property}" is not supported.`
        + `\n\n`
        + `Reason: ${error.message}`,
      error,
    })

    this.property = property
  }
}

export class DeprecatedConstructDiagnostic extends WarningDiagnostic {
  construct: string

  constructor (construct: string, error: Error) {
    super({
      title: `Use of deprecated Construct`,
      message:
        `Construct "${construct}" is deprecated and will eventually be removed.`
        + `\n\n`
        + `Hint: ${error.message}`,
    })

    this.construct = construct
  }
}

export class UnsupportedRuntimeFeatureDiagnostic extends ErrorDiagnostic {
  runtimeId: string

  constructor (runtimeId: string, error: Error) {
    super({
      title: `Use of unsupported runtime feature`,
      message:
        `Runtime "${runtimeId}" does not support the requested feature.`
        + `\n\n`
        + `Missing feature: ${error.message}`,
      error,
    })

    this.runtimeId = runtimeId
  }
}

export class ConstructDiagnostic extends Diagnostic {
  underlying: Diagnostic

  constructor (construct: Construct, underlying: Diagnostic) {
    super({
      title: `[${construct.describe()}] ${underlying.title}`,
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
