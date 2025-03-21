import { expr, ident, Program } from '../sourcegen'

export interface MaintenanceWindowResource {
  name: string
  tags: Array<string>,
  startsAt: string
  endsAt: string
  repeatInterval?: number
  repeatUnit?: string
  repeatEndsAt?: string
}

const construct = 'MaintenanceWindow'

export function codegen (program: Program, logicalId: string, resource: MaintenanceWindowResource): void {
  program.import(construct, 'checkly/constructs')

  program.section(expr(ident(construct), builder => {
    builder.new(builder => {
      builder.string(logicalId)
      builder.object(builder => {
        builder.string('name', resource.name)

        builder.array('tags', builder => {
          for (const tag of resource.tags) {
            builder.string(tag)
          }
        })

        builder.expr('startsAt', ident('Date'), builder => {
          builder.new(builder => {
            builder.string(resource.startsAt)
          })
        })

        builder.expr('endsAt', ident('Date'), builder => {
          builder.new(builder => {
            builder.string(resource.endsAt)
          })
        })

        if (resource.repeatInterval !== undefined) {
          builder.number('repeatInterval', resource.repeatInterval)
        }

        if (resource.repeatUnit) {
          builder.string('repeatUnit', resource.repeatUnit)
        }

        if (resource.repeatEndsAt) {
          const repeatEndsAt = resource.repeatEndsAt
          builder.expr('repeatEndsAt', ident('Date'), builder => {
            builder.new(builder => {
              builder.string(repeatEndsAt)
            })
          })
        }
      })
    })
  }))
}
