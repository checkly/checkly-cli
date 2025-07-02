import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildMonitorProps, MonitorResource } from './monitor-codegen'
import { UrlRequest } from './url-request'
import { valueForUrlRequest } from './url-request-codegen'

export interface UrlMonitorResource extends MonitorResource {
  checkType: 'URL'
  request: UrlRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

const construct = 'UrlMonitor'

export class UrlMonitorCodegen extends Codegen<UrlMonitorResource> {
  describe (resource: UrlMonitorResource): string {
    return `URL Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: UrlMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/url-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.value('request', valueForUrlRequest(this.program, file, context, resource.request))

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
