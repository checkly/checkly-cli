import { Codegen, Context } from './internal/codegen'
import { expr, GeneratedFile, ident, kebabCase, Value } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'
import { TcpAssertion, TcpRequest } from './tcp-check'

export interface TcpCheckResource extends CheckResource {
  checkType: 'TCP'
  request: TcpRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForTcpAssertion (genfile: GeneratedFile, assertion: TcpAssertion): Value {
  genfile.namedImport('TcpAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_DATA':
      return valueForGeneralAssertion('TcpAssertionBuilder', 'responseData', assertion)
    case 'RESPONSE_TIME':
      return valueForNumericAssertion('TcpAssertionBuilder', 'responseTime', assertion)
    default:
      throw new Error(`Unsupported TCP assertion source ${assertion.source}`)
  }
}

const construct = 'TcpCheck'

export class TcpCheckCodegen extends Codegen<TcpCheckResource> {
  gencode (logicalId: string, resource: TcpCheckResource, context: Context): void {
    const file = this.program.generatedConstructFile(`resources/tcp-checks/${kebabCase(resource.name)}`)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('request', builder => {
            builder.string('hostname', resource.request.hostname)
            builder.number('port', resource.request.port)

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.data) {
              builder.string('data', resource.request.data)
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              if (assertions.length > 0) {
                builder.array('assertions', builder => {
                  for (const assertion of assertions) {
                    builder.value(valueForTcpAssertion(file, assertion))
                  }
                })
              }
            }
          })

          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
