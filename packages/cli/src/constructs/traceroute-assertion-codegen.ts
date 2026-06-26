import { GeneratedFile, Value } from '../sourcegen/index.js'
import { valueForNumericAssertion } from './internal/assertion-codegen.js'
import { TracerouteAssertion } from './traceroute-assertion.js'

export function valueForTracerouteAssertion (genfile: GeneratedFile, assertion: TracerouteAssertion): Value {
  genfile.namedImport('TracerouteAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'responseTime', assertion)
    case 'HOP_COUNT':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'hopCount', assertion)
    case 'PACKET_LOSS':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'packetLoss', assertion)
    default:
      throw new Error(`Unsupported traceroute assertion source ${assertion.source}`)
  }
}
