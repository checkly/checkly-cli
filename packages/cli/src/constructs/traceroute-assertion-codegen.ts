import { GeneratedFile, Value } from '../sourcegen'
import { valueForNumericAssertion } from './internal/assertion-codegen'
import { TracerouteAssertion } from './traceroute-assertion'

export function valueForTracerouteAssertion (genfile: GeneratedFile, assertion: TracerouteAssertion): Value {
  genfile.namedImport('TracerouteAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'responseTime', assertion, {
        hasProperty: true,
      })
    case 'HOP_COUNT':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'hopCount', assertion, {
        hasProperty: false,
      })
    case 'PACKET_LOSS':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'packetLoss', assertion, {
        hasProperty: false,
      })
    default:
      throw new Error(`Unsupported traceroute assertion source ${assertion.source}`)
  }
}
