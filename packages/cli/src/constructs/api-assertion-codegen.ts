import { GeneratedFile, Value } from '../sourcegen/index.js'
import { Assertion } from './api-assertion.js'
import { unsupportedAssertionSource, valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'

export function valueForAssertion (genfile: GeneratedFile, assertion: Assertion): Value {
  genfile.namedImport('AssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('AssertionBuilder', 'statusCode', assertion)
    case 'JSON_BODY':
      return valueForGeneralAssertion('AssertionBuilder', 'jsonBody', assertion)
    case 'HEADERS':
      return valueForGeneralAssertion('AssertionBuilder', 'headers', assertion)
    case 'TEXT_BODY':
      return valueForGeneralAssertion('AssertionBuilder', 'textBody', assertion)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('AssertionBuilder', 'responseTime', assertion)
    default:
      return unsupportedAssertionSource(assertion.source)
  }
}
