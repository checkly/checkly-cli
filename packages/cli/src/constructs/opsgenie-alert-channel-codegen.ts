import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface OpsgenieAlertChannelResource extends AlertChannelResource {
  type: 'OPSGENIE'
  config: {
    name: string
    apiKey: string
    region: string
    priority: string
  }
}

const construct = 'OpsgenieAlertChannel'

export class OpsgenieAlertChannelCodegen extends Codegen<OpsgenieAlertChannelResource> {
  describe (resource: OpsgenieAlertChannelResource): string {
    return `Opsgenie Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: OpsgenieAlertChannelResource, context: Context): void {
    const { name } = resource.config

    const filename = context.filePath('resources/alert-channels/opsgenie', name, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${name} opsgenie`,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: OpsgenieAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', config.name)
            builder.string('apiKey', config.apiKey)
            builder.string('region', config.region)
            builder.string('priority', config.priority)

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
