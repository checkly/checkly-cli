import { Codegen, Context } from './internal/codegen'
import { decl, expr, GeneratedFile, ident, kebabCase, Value } from '../sourcegen'

export interface PrivateLocationResource {
  id: string
  name: string
  slugName: string
  icon?: string
  proxyUrl?: string
}

const construct = 'PrivateLocation'

export function valueForPrivateLocationFromId (genfile: GeneratedFile, physicalId: string): Value {
  genfile.namedImport(construct, 'checkly/constructs')

  return expr(ident(construct), builder => {
    builder.member(ident('fromId'))
    builder.call(builder => {
      builder.string(physicalId)
    })
  })
}

export class PrivateLocationCodegen extends Codegen<PrivateLocationResource> {
  prepare (logicalId: string, resource: PrivateLocationResource, context: Context): void {
    context.registerPrivateLocation(
      resource.id,
      this.program.generatedConstructFile(`resources/private-locations/${kebabCase(resource.slugName)}`),
    )
  }

  gencode (logicalId: string, resource: PrivateLocationResource, context: Context): void {
    const { id, file } = context.lookupPrivateLocation(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', resource.name)
            builder.string('slugName', resource.slugName)

            if (resource.icon) {
              builder.string('icon', resource.icon)
            }

            if (resource.proxyUrl) {
              builder.string('proxyUrl', resource.proxyUrl)
            }
          })
        })
      }))

      builder.export()
    }))
  }
}
