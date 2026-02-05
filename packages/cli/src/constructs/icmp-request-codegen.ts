import { GeneratedFile, object, Program, Value } from '../sourcegen'
import { valueForIcmpAssertion } from './icmp-assertion-codegen'
import { IcmpRequest } from './icmp-request'
import { Context } from './internal/codegen'

export function valueForIcmpRequest (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  request: IcmpRequest,
): Value {
  return object(builder => {
    builder.string('hostname', request.hostname)

    if (request.ipFamily && request.ipFamily !== 'IPv4') {
      builder.string('ipFamily', request.ipFamily)
    }

    if (request.pingCount !== undefined) {
      builder.number('pingCount', request.pingCount)
    }

    if (request.assertions) {
      const assertions = request.assertions
      if (assertions.length > 0) {
        builder.array('assertions', builder => {
          for (const assertion of assertions) {
            builder.value(valueForIcmpAssertion(genfile, assertion))
          }
        })
      }
    }
  })
}
