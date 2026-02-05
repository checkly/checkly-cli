import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { IcmpRequest } from './icmp-request'
import { valueForIcmpRequest } from './icmp-request-codegen'

export interface IcmpMonitorResource extends MonitorResource {
  checkType: 'ICMP'
  request: IcmpRequest
  degradedPacketLossThreshold?: number
  maxPacketLossThreshold?: number
}

const construct = 'IcmpMonitor'

export class IcmpMonitorCodegen extends Codegen<IcmpMonitorResource> {
  describe (resource: IcmpMonitorResource): string {
    return `ICMP Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: IcmpMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/icmp-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.value('request', valueForIcmpRequest(this.program, file, context, resource.request))

          if (resource.degradedPacketLossThreshold !== undefined) {
            builder.number('degradedPacketLossThreshold', resource.degradedPacketLossThreshold)
          }

          if (resource.maxPacketLossThreshold !== undefined) {
            builder.number('maxPacketLossThreshold', resource.maxPacketLossThreshold)
          }

          buildMonitorProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
