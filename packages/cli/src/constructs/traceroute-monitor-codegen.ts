import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { TracerouteRequest } from './traceroute-request'
import { valueForTracerouteRequest } from './traceroute-request-codegen'

export interface TracerouteMonitorResource extends MonitorResource {
  checkType: 'TRACEROUTE'
  request: TracerouteRequest
  degradedResponseTime?: number
  maxResponseTime?: number
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
          builder.value('request', valueForTracerouteRequest(this.program, file, context, resource.request))

          if (resource.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', resource.degradedResponseTime)
          }

          if (resource.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', resource.maxResponseTime)
          }

          buildMonitorProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
