import { expr, GeneratedFile, ident, Value } from '../sourcegen'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen'
import { Codegen, Context } from './internal/codegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { TcpAssertion, TcpRequest } from './tcp-monitor'

export interface TcpMonitorResource extends MonitorResource {
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

const construct = 'TcpMonitor'

export class TcpMonitorCodegen extends Codegen<TcpMonitorResource> {
  describe (resource: TcpMonitorResource): string {
    return `TCP Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: TcpMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/tcp-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildMonitorProps(this.program, file, builder, resource, context)

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
        })
      })
    }))
  }
}
