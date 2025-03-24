import { Codegen } from './internal/codegen'
import { expr, ident, Program, Value } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check.codegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion.codegen'
import { TcpAssertion, TcpRequest } from './tcp-check'

export interface TcpCheckResource extends CheckResource {
  checkType: 'TCP'
  request: TcpRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForTcpAssertion (program: Program, assertion: TcpAssertion): Value {
  program.import('TcpAssertionBuilder', 'checkly/constructs')

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
  gencode (logicalId: string, resource: TcpCheckResource): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('request', builder => {
            builder.string('hostname', resource.request.hostname)
            builder.number('port', resource.request.port)

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              builder.array('assertions', builder => {
                for (const assertion of assertions) {
                  builder.value(valueForTcpAssertion(this.program, assertion))
                }
              })
            }

            if (resource.request.data) {
              builder.string('data', resource.request.data)
            }
          })

          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildCheckProps(this.program, builder, resource)
        })
      })
    }))
  }
}
