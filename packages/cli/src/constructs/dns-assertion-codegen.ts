import { GeneratedFile, Value } from '../sourcegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'
import { DnsAssertion } from './dns-assertion'

export function valueForDnsAssertion (genfile: GeneratedFile, assertion: DnsAssertion): Value {
  genfile.namedImport('DnsAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_CODE':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'responseCode', assertion, {
        hasProperty: false,
        hasRegex: false,
      })
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('DnsAssertionBuilder', 'responseTime', assertion)
    case 'TEXT_ANSWER':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'textAnswer', assertion, {
        hasProperty: false,
        hasRegex: true,
      })
    case 'JSON_ANSWER':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'jsonAnswer', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    default:
      throw new Error(`Unsupported DNS assertion source ${assertion.source}`)
  }
}
