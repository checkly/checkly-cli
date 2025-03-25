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
  prepare (logicalId: string, resource: OpsgenieAlertChannelResource, context: Context): void {
    context.registerAlertChannel(resource.id, 'opsgenieAlert')
  }

  gencode (logicalId: string, resource: OpsgenieAlertChannelResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupAlertChannel(resource.id)

    const { config } = resource

    this.program.section(decl(id, builder => {
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
    }))
  }
}
