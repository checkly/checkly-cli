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
  prepare (logicalId: string, resource: SlackAlertChannelResource, context: Context): void {
    context.registerAlertChannel(resource.id, 'slackAlert')
  }

  gencode (logicalId: string, resource: SlackAlertChannelResource, context: Context): void {
    this.program.import(construct, 'checkly/constructs')

    const id = context.lookupAlertChannel(resource.id)

    const { config } = resource

    this.program.section(decl(id, builder => {
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
    }))
  }
}
