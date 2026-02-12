import { GeneratedFile, Value } from '../sourcegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'
import { IcmpAssertion } from './icmp-assertion'

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
      throw new Error(`Unsupported ICMP assertion source ${assertion.source}`)
  }
}
