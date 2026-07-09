import { GeneratedFile, Value } from '../sourcegen/index.js'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { GrpcAssertion } from './grpc-assertion.js'

export function valueForGrpcAssertion (genfile: GeneratedFile, assertion: GrpcAssertion): Value {
  genfile.namedImport('GrpcAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'responseTime', assertion)
    case 'GRPC_STATUS_CODE':
      return valueForNumericAssertion('GrpcAssertionBuilder', 'statusCode', assertion)
    case 'GRPC_HEALTHCHECK_STATUS':
      return valueForGeneralAssertion('GrpcAssertionBuilder', 'healthCheckStatus', assertion, {
        hasProperty: false,
        hasRegex: false,
      })
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
      throw new Error(`Unsupported gRPC assertion source ${assertion.source}`)
  }
}
