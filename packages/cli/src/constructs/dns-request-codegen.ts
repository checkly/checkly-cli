import { GeneratedFile, object, Program, Value } from '../sourcegen/index.js'
import { valueForDnsAssertion } from './dns-assertion-codegen.js'
import { DnsRequest } from './dns-request.js'
import { Context } from './internal/codegen/index.js'

export function valueForDnsRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: DnsRequest,
): Value {
  return object(builder => {
    builder.string('recordType', request.recordType)
    builder.string('query', request.query)

    if (request.nameServer) {
      builder.string('nameServer', request.nameServer)
    }

    if (request.port) {
      builder.number('port', request.port)
    }

    if (request.protocol && request.protocol !== 'UDP') {
      builder.string('protocol', request.protocol)
    }

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForDnsAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
