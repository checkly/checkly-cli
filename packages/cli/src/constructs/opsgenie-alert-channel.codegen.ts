import { Codegen } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

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
  gencode (logicalId: string, resource: OpsgenieAlertChannelResource): void {
    this.program.import(construct, 'checkly/constructs')

    const id = this.program.registerVariable(
      `${construct}::${logicalId}`,
      ident(this.program.nth('opsgenieAlert')),
    )

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
