import { GeneratedFile, object, Program, Value } from '../sourcegen/index.js'
import { valueForTracerouteAssertion } from './traceroute-assertion-codegen.js'
import { TracerouteRequest } from './traceroute-request.js'
import { Context } from './internal/codegen/index.js'

export function valueForTracerouteRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: TracerouteRequest,
): Value {
  return object(builder => {
    builder.string('url', request.url)

    if (request.protocol && request.protocol !== 'TCP') {
      builder.string('protocol', request.protocol)
    }

    // `port` is not sent for ICMP probes (the backend strips it), so only emit
    // it for the protocols that use it.
    if (request.port !== undefined && request.protocol !== 'ICMP') {
      builder.number('port', request.port)
    }

    if (request.ipFamily && request.ipFamily !== 'IPv4') {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.maxHops !== undefined) {
      builder.number('maxHops', request.maxHops)
    }

    if (request.maxUnknownHops !== undefined) {
      builder.number('maxUnknownHops', request.maxUnknownHops)
    }

    if (request.ptrLookup !== undefined) {
      builder.boolean('ptrLookup', request.ptrLookup)
    }

    if (request.timeout !== undefined) {
      builder.number('timeout', request.timeout)
    }

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForTracerouteAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
