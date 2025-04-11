import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'

export interface StatusPageServiceResource {
  id: string
  name: string
}

const construct = 'StatusPageService'

export class StatusPageServiceCodegen extends Codegen<StatusPageServiceResource> {
  prepare (logicalId: string, resource: StatusPageServiceResource, context: Context): void {
    const { filename } = context.filename(resource.name)

    context.registerStatusPageService(
      resource.id,
      this.program.generatedConstructFile(`resources/status-pages/services/${filename}`),
    )
  }

  gencode (logicalId: string, resource: StatusPageServiceResource, context: Context): void {
    const { id, file } = context.lookupStatusPageService(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
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
