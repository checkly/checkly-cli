import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident } from '../sourcegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { GrpcRequest } from './grpc-request.js'
import { valueForGrpcRequest } from './grpc-request-codegen.js'

export interface GrpcMonitorResource extends MonitorResource {
  checkType: 'GRPC'
  request: GrpcRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

const construct = 'GrpcMonitor'

export class GrpcMonitorCodegen extends Codegen<GrpcMonitorResource> {
  describe (resource: GrpcMonitorResource): string {
    return `gRPC Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: GrpcMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/grpc-monitors', resource.name, {
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

          builder.value('request', valueForGrpcRequest(this.program, file, context, resource.request))
        })
      })
    }))
  }
}
