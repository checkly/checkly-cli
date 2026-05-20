import { Codegen, Context } from './internal/codegen/index.js'
import { decl, expr, ident } from '../sourcegen/index.js'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen.js'

export interface SlackAppAlertChannelResource extends AlertChannelResource {
  type: 'SLACK_APP'
  config: {
    slackChannels?: string[]
  }
}

const construct = 'SlackAlertChannel'

export class SlackAppAlertChannelCodegen extends Codegen<SlackAppAlertChannelResource> {
  describe (resource: SlackAppAlertChannelResource): string {
    if (resource.config.slackChannels) {
      return `Slack App Alert Channels: ${resource.config.slackChannels}`
    }

    return 'Slack App Alert Channel'
  }

  prepare (logicalId: string, resource: SlackAppAlertChannelResource, context: Context): void {
    const { slackChannels } = resource.config

    const last8Chars = slackChannels?.concat().slice(-8)
    const fallbackName = `slack-app-${last8Chars}`

    const filename = context.filePath('resources/alert-channels/slack-app', fallbackName, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${fallbackName} slack`,
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
            if (config.slackChannels?.length) {
              builder.array('slackChannels', arrayBuilder => {
                for (const channel of config.slackChannels!) {
                  arrayBuilder.string(channel)
                }
              })
            }
            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
