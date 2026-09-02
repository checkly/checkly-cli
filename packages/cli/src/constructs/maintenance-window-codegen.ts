import { Codegen, Context } from './internal/codegen/index.js'
import { expr, ident, Value } from '../sourcegen/index.js'

/** The expression for a timestamp the API reports as an ISO string: `new Date('<iso>')`. */
export function valueForDate (iso: string): Value {
  return expr(ident('Date'), builder => {
    builder.new(builder => {
      builder.string(iso)
    })
  })
}

export interface MaintenanceWindowResource {
  name: string
  tags: Array<string>
  startsAt: string
  endsAt: string
  repeatInterval?: number | null
  repeatUnit?: string
  repeatEndsAt?: string
  timezone?: string | null
  pauseAllChecks?: boolean
  silenceAlertsTags?: Array<string>
  silenceAllAlerts?: boolean
}

const construct = 'MaintenanceWindow'

export class MaintenanceWindowCodegen extends Codegen<MaintenanceWindowResource> {
  describe (resource: MaintenanceWindowResource): string {
    return `Maintenance Window: ${resource.name}`
  }

  gencode (logicalId: string, resource: MaintenanceWindowResource, context: Context): void {
    const filePath = context.filePath('resources/maintenance-windows', resource.name, {
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('name', resource.name)

          builder.array('tags', builder => {
            for (const tag of resource.tags) {
              builder.string(tag)
            }
          })

          builder.value('startsAt', valueForDate(resource.startsAt))
          builder.value('endsAt', valueForDate(resource.endsAt))

          if (resource.repeatInterval !== undefined && resource.repeatInterval !== null) {
            builder.number('repeatInterval', resource.repeatInterval)
          }

          if (resource.repeatUnit) {
            builder.string('repeatUnit', resource.repeatUnit)
          }

          if (resource.repeatEndsAt) {
            builder.value('repeatEndsAt', valueForDate(resource.repeatEndsAt))
          }

          if (resource.timezone) {
            builder.string('timezone', resource.timezone)
          }

          // The default value for pauseAllChecks is false, only include if true.
          if (resource.pauseAllChecks !== undefined && resource.pauseAllChecks) {
            builder.boolean('pauseAllChecks', resource.pauseAllChecks)
          }

          if (resource.silenceAlertsTags?.length) {
            const silenceAlertsTags = resource.silenceAlertsTags
            builder.array('silenceAlertsTags', builder => {
              for (const tag of silenceAlertsTags) {
                builder.string(tag)
              }
            })
          }

          // The default value for silenceAllAlerts is false, only include if true.
          if (resource.silenceAllAlerts !== undefined && resource.silenceAllAlerts) {
            builder.boolean('silenceAllAlerts', resource.silenceAllAlerts)
          }
        })
      })
    }))
  }
}
