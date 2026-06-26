import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident } from '../sourcegen/index.js'
import { buildMonitorProps, MonitorResource } from './monitor-codegen.js'
import { SslRequest } from './ssl-request.js'
import { valueForSslRequest } from './ssl-request-codegen.js'

export interface SslMonitorResource extends MonitorResource {
  checkType: 'SSL'
  request: SslRequest
}

const construct = 'SslMonitor'

export class SslMonitorCodegen extends Codegen<SslMonitorResource> {
  describe (resource: SslMonitorResource): string {
    return `SSL Monitor: ${resource.name}`
  }

  gencode (logicalId: string, resource: SslMonitorResource, context: Context): void {
    const filePath = context.filePath('resources/ssl-monitors', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          buildMonitorProps(this.program, file, builder, resource, context)

          builder.value('request', valueForSslRequest(this.program, file, context, resource.request))
        })
      })
    }))
  }
}
