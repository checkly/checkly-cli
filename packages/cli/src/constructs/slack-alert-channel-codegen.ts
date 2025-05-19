import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'

export interface SlackAlertChannelResource extends AlertChannelResource {
  type: 'SLACK'
  config: {
    url: string
    channel?: string
  }
}

const construct = 'SlackAlertChannel'

export class SlackAlertChannelCodegen extends Codegen<SlackAlertChannelResource> {
  describe (resource: SlackAlertChannelResource): string {
    if (resource.config.channel) {
      return `Slack Alert Channel: ${resource.config.channel}`
    }

    return 'Slack Alert Channel'
  }

  prepare (logicalId: string, resource: SlackAlertChannelResource, context: Context): void {
    const { channel } = resource.config

    context.registerAlertChannel(
      resource.id,
      channel ? `${channel} slack` : 'slack',
      this.program.generatedConstructFile('resources/alert-channels/slack'),
    )
  }

  gencode (logicalId: string, resource: SlackAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('url', config.url)

            if (config.channel) {
              builder.string('channel', config.channel)
            }

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
