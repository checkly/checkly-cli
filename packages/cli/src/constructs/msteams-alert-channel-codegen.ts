import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'

export interface MSTeamsAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_MSTEAMS'
  }
}

const construct = 'MSTeamsAlertChannel'

export class MSTeamsAlertChannelCodegen extends Codegen<MSTeamsAlertChannelResource> {
  prepare (logicalId: string, resource: MSTeamsAlertChannelResource, context: Context): void {
    context.registerAlertChannel(resource.id, 'teamsAlert')
  }

  gencode (logicalId: string, resource: MSTeamsAlertChannelResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupAlertChannel(resource.id)

    const { config } = resource

    this.program.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', config.name)
            builder.string('url', config.url)

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
