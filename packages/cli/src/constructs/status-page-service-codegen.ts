import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'

export interface StatusPageServiceResource {
  id: string
  name: string
}

const construct = 'StatusPageService'

export class StatusPageServiceCodegen extends Codegen<StatusPageServiceResource> {
  prepare (logicalId: string, resource: StatusPageServiceResource, context: Context): void {
    context.registerStatusPageService(resource.id)
  }

  gencode (logicalId: string, resource: StatusPageServiceResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupStatusPageService(resource.id)

    this.program.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', resource.name)
          })
        })
      }))

      builder.export()
    }))
  }
}
