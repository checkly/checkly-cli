import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { DnsRequest } from './dns-request'
import { valueForDnsRequest } from './dns-request-codegen'

export interface DnsMonitorResource extends MonitorResource {
  checkType: 'DNS'
  request: DnsRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

const construct = 'DnsMonitor'

export class DnsMonitorCodegen extends Codegen<DnsMonitorResource> {
  describe (resource: DnsMonitorResource): string {
    return `DNS Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: DnsMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/dns-monitors', resource.name, {
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

          builder.value('request', valueForDnsRequest(this.program, file, context, resource.request))
        })
      })
    }))
  }
}
