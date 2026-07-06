import { GeneratedFile, Value } from '../sourcegen/index.js'
import { valueForNumericAssertion } from './internal/assertion-codegen.js'
import { TracerouteAssertion } from './traceroute-assertion.js'

export function valueForTracerouteAssertion (genfile: GeneratedFile, assertion: TracerouteAssertion): Value {
  genfile.namedImport('TracerouteAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      // The forward API selects the response-time property via a chained method
      // (`responseTime().max().lessThan(...)`), so emit the property as a
      // selector instead of dropping it. An empty/unknown property round-trips
      // to a bare `responseTime()` (which defaults to `avg`).
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'responseTime', assertion, {
        propertySelectors: ['avg', 'min', 'max', 'stdDev'],
      })
    case 'HOP_COUNT':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'hopCount', assertion)
    case 'PACKET_LOSS':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'packetLoss', assertion)
    default:
      throw new Error(`Unsupported traceroute assertion source ${assertion.source}`)
  }
}
