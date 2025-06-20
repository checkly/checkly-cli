import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { HttpRequest } from './http-request'
import { valueForHttpRequest } from './http-request-codegen'

export interface HttpCheckResource extends CheckResource {
  checkType: 'HTTP'
  request: HttpRequest
  degradedResponseTime?: number
  maxResponseTime?: number
}

const construct = 'HttpCheck'

export class HttpCheckCodegen extends Codegen<HttpCheckResource> {
  describe (resource: HttpCheckResource): string {
    return `HTTP Check: ${resource.name}`
  }

  gencode (logicalId: string, resource: HttpCheckResource, context: Context): void {
    const filePath = context.filePath('resources/http-checks', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.value('request', valueForHttpRequest(this.program, file, context, resource.request))

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
