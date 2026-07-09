import { GeneratedFile, Value } from '../sourcegen/index.js'
import { unsupportedAssertionSource, valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { IcmpAssertion } from './icmp-assertion.js'

export function valueForIcmpAssertion (genfile: GeneratedFile, assertion: IcmpAssertion): Value {
  genfile.namedImport('IcmpAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'LATENCY':
      return valueForNumericAssertion('IcmpAssertionBuilder', 'latency', assertion, {
        hasProperty: true,
      })
    case 'JSON_RESPONSE':
      return valueForGeneralAssertion('IcmpAssertionBuilder', 'jsonResponse', assertion, {
        hasProperty: true,
        hasRegex: false,
      })
    default:
      return unsupportedAssertionSource(assertion.source, 'ICMP')
  }
}
