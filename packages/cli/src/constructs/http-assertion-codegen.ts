import { GeneratedFile, Value } from '../sourcegen'
import { HttpAssertion } from './http-assertion'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'

export function valueForHttpAssertion (genfile: GeneratedFile, assertion: HttpAssertion): Value {
  genfile.namedImport('HttpAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'STATUS_CODE':
      return valueForNumericAssertion('HttpAssertionBuilder', 'statusCode', assertion)
    case 'JSON_BODY':
      return valueForGeneralAssertion('HttpAssertionBuilder', 'jsonBody', assertion)
    case 'HEADERS':
      return valueForGeneralAssertion('HttpAssertionBuilder', 'headers', assertion)
    case 'TEXT_BODY':
      return valueForGeneralAssertion('HttpAssertionBuilder', 'textBody', assertion)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('HttpAssertionBuilder', 'responseTime', assertion)
    default:
      throw new Error(`Unsupported assertion source ${assertion.source}`)
  }
}
