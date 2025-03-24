import { Codegen } from './internal/codegen'
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
  gencode (logicalId: string, resource: SlackAlertChannelResource): void {
    this.program.import(construct, 'checkly/constructs')

    const id = this.program.registerVariable(
      `${construct}::${logicalId}`,
      ident(this.program.nth('slackAlert')),
    )

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
