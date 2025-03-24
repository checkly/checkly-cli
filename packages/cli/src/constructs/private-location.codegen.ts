import { Codegen } from '../codegen'
import { expr, ident } from '../sourcegen'

export interface PrivateLocationResource {
  name: string
  slugName: string
  icon?: string
  proxyUrl?: string
}

const construct = 'PrivateLocation'

export class PrivateLocationCodegen extends Codegen<PrivateLocationResource> {
  gencode (logicalId: string, resource: PrivateLocationResource): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
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
  }
}
