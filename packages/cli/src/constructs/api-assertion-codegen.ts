import { GeneratedFile, Value } from '../sourcegen'
import { Assertion } from './api-assertion'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'

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
      throw new Error(`Unsupported assertion source ${assertion.source}`)
  }
}
