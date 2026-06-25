import { expr, GeneratedFile, ident, Value } from '../sourcegen/index.js'
import { valueForNumericAssertion } from './internal/assertion-codegen.js'
import { Codegen, Context } from './internal/codegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { TracerouteAssertion, TracerouteRequest } from './traceroute-monitor.js'

export interface TracerouteMonitorResource extends MonitorResource {
  checkType: 'TRACEROUTE'
  request: TracerouteRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

export function valueForTracerouteAssertion (genfile: GeneratedFile, assertion: TracerouteAssertion): Value {
  genfile.namedImport('TracerouteAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      // RESPONSE_TIME carries a required statistic property (avg|min|max|stdDev);
      // emit it as the first builder argument so the round-trip preserves it.
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'responseTime', assertion, { hasProperty: true })
    case 'HOP_COUNT':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'hopCount', assertion)
    case 'PACKET_LOSS':
      return valueForNumericAssertion('TracerouteAssertionBuilder', 'packetLoss', assertion)
    default:
      throw new Error(`Unsupported traceroute assertion source ${assertion.source}`)
  }
}

const construct = 'TracerouteMonitor'

export class TracerouteMonitorCodegen extends Codegen<TracerouteMonitorResource> {
  describe (resource: TracerouteMonitorResource): string {
    return `Traceroute Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: TracerouteMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/traceroute-monitors', resource.name, {
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
            builder.string('url', resource.request.url)

            if (resource.request.protocol) {
              builder.string('protocol', resource.request.protocol)
            }

            if (resource.request.port !== undefined) {
              builder.number('port', resource.request.port)
            }

            if (resource.request.ipFamily) {
              builder.string('ipFamily', resource.request.ipFamily)
            }

            if (resource.request.maxHops !== undefined) {
              builder.number('maxHops', resource.request.maxHops)
            }

            if (resource.request.maxUnknownHops !== undefined) {
              builder.number('maxUnknownHops', resource.request.maxUnknownHops)
            }

            if (resource.request.ptrLookup !== undefined) {
              builder.boolean('ptrLookup', resource.request.ptrLookup)
            }

            if (resource.request.timeout !== undefined) {
              builder.number('timeout', resource.request.timeout)
            }

            if (resource.request.assertions) {
              const assertions = resource.request.assertions
              if (assertions.length > 0) {
                builder.array('assertions', builder => {
                  for (const assertion of assertions) {
                    builder.value(valueForTracerouteAssertion(file, assertion))
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
