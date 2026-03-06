import { GeneratedFile, object, Program, Value } from '../sourcegen'
import { valueForTracerouteAssertion } from './traceroute-assertion-codegen'
import { TracerouteRequest } from './traceroute-request'
import { Context } from './internal/codegen'

export function valueForTracerouteRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: TracerouteRequest,
): Value {
  return object(builder => {
    builder.string('hostname', request.hostname)

    if (request.port !== undefined && request.port !== 443) {
      builder.number('port', request.port)
    }

    if (request.ipFamily && request.ipFamily !== 'IPv4') {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.maxHops !== undefined && request.maxHops !== 30) {
      builder.number('maxHops', request.maxHops)
    }

    if (request.maxUnknownHops !== undefined && request.maxUnknownHops !== 15) {
      builder.number('maxUnknownHops', request.maxUnknownHops)
    }

    if (request.ptrLookup !== undefined && request.ptrLookup !== true) {
      builder.boolean('ptrLookup', request.ptrLookup)
    }

    if (request.timeout !== undefined && request.timeout !== 10) {
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
