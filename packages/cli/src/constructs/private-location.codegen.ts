import { expr, ident, Program } from '../sourcegen'

export interface PrivateLocationResource {
  name: string
  slugName: string
  icon?: string
  proxyUrl?: string
}

const construct = 'PrivateLocation'

export function codegen (program: Program, logicalId: string, resource: PrivateLocationResource): void {
  program.import(construct, 'checkly/constructs')

  program.section(expr(ident(construct), builder => {
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
