import { Codegen, Context } from './internal/codegen/index.js'
import { decl, expr, ident } from '../sourcegen/index.js'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen.js'

export interface SlackAppAlertChannelResource extends AlertChannelResource {
  type: 'SLACK_APP'
  config: {
    slackChannels: string[]
  }
}

const construct = 'SlackAppAlertChannel'

export class SlackAppAlertChannelCodegen extends Codegen<SlackAppAlertChannelResource> {
  describe (resource: SlackAppAlertChannelResource): string {
    return `Slack App Alert Channel: ${resource.config.slackChannels.join(', ')}`
  }

  prepare (logicalId: string, resource: SlackAppAlertChannelResource, context: Context): void {
    const { slackChannels } = resource.config

    const name = slackChannels.join(',')

    const filename = context.filePath('resources/alert-channels/slack-app', name, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${name} slack app alert`,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: SlackAppAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.array('slackChannels', arrayBuilder => {
              for (const channel of config.slackChannels) {
                arrayBuilder.string(channel)
              }
            })
            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
