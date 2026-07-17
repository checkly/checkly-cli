import { expr, ident, object, GeneratedFile, Value } from '../sourcegen/index.js'
import { unsupportedAssertionSource, valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { GrpcAssertion, GrpcHealthStatus, grpcHealthStatusTargetByLabel } from './grpc-assertion.js'

// Reverse of grpcHealthStatusTargetByLabel: numeric wire target -> friendly label.
// Derived from the shared map so the label↔number mapping lives in one place.
const grpcHealthStatusLabelByTarget: Record<string, GrpcHealthStatus> = Object.fromEntries(
  Object.entries(grpcHealthStatusTargetByLabel).map(([label, target]) => [target, label as GrpcHealthStatus]),
)

function isGrpcHealthStatusLabel (value: string): value is GrpcHealthStatus {
  return Object.hasOwn(grpcHealthStatusTargetByLabel, value)
}

// Resolves a stored target to the label the builder's (narrowed) `equals`/`notEquals`
// parameter type accepts — either the label for a known number, or the target itself
// when it is already a valid label (a legacy/hand-written check may store one).
// Returns undefined for anything else (out-of-range number, empty, garbage), since a
// builder call for those would not compile against the narrowed builder type.
function grpcHealthStatusLabelForTarget (target: string): GrpcHealthStatus | undefined {
  return grpcHealthStatusLabelByTarget[target] ?? (isGrpcHealthStatusLabel(target) ? target : undefined)
}

// Emits `GrpcAssertionBuilder.healthCheckStatus().equals('SERVING')`, reverse-mapping
// the numeric wire target back to its label. When the stored target maps to neither
// a known number nor a valid label (out-of-range, empty, or otherwise unmappable), a
// builder call would not type-check against the narrowed builder parameter type, so
// the raw `Assertion` object-literal shape is emitted instead — which the `Assertion`
// type accepts as a plain string and faithfully round-trips the stored value.
function valueForGrpcHealthCheckStatusAssertion (assertion: GrpcAssertion): Value {
  const label = grpcHealthStatusLabelForTarget(assertion.target)
  if (label === undefined) {
    return object(builder => {
      builder.string('source', assertion.source)
      builder.string('comparison', assertion.comparison)
      builder.string('target', assertion.target)
      builder.string('property', assertion.property)
      if (assertion.regex === null) {
        builder.null('regex')
      } else {
        builder.string('regex', assertion.regex)
      }
    })
  }

  return expr(ident('GrpcAssertionBuilder'), builder => {
    builder.member(ident('healthCheckStatus'))
    builder.call(() => {})
    switch (assertion.comparison) {
      case 'EQUALS':
        builder.member(ident('equals'))
        builder.call(builder => {
          builder.string(label)
        })
        break
      case 'NOT_EQUALS':
        builder.member(ident('notEquals'))
        builder.call(builder => {
          builder.string(label)
        })
        break
      default:
        throw new Error(`Unsupported comparison ${assertion.comparison} for assertion source ${assertion.source}`)
    }
  })
}

export function valueForGrpcAssertion (genfile: GeneratedFile, assertion: GrpcAssertion): Value {
  genfile.namedImport('GrpcAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'responseTime', assertion)
    case 'GRPC_STATUS_CODE':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'statusCode', assertion)
    case 'GRPC_HEALTHCHECK_STATUS':
      return valueForGrpcHealthCheckStatusAssertion(assertion)
    case 'GRPC_RESPONSE':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'responseMessage', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    case 'TEXT_BODY':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'textBody', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    case 'GRPC_METADATA':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'responseMetadata', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    default:
      return unsupportedAssertionSource(assertion.source, 'gRPC')
  }
}
