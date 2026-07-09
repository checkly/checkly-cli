import { GeneratedFile, Value } from '../sourcegen/index.js'
import { unsupportedAssertionSource, valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { DnsAssertion } from './dns-assertion.js'

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
        hasProperty: true,
        hasRegex: false,
      })
    case 'JSON_ANSWER':
      return valueForGeneralAssertion('DnsAssertionBuilder', 'jsonAnswer', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    default:
      return unsupportedAssertionSource(assertion.source, 'DNS')
  }
}
