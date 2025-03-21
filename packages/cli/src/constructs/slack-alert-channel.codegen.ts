import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'

export interface SlackAlertChannelResource extends AlertChannelResource {
  type: 'SLACK'
  config: {
    url: string
    channel?: string
  }
}

const construct = 'SlackAlertChannel'

export function codegen (program: Program, logicalId: string, resource: SlackAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('slackAlert')),
  )

  const { config } = resource

  program.section(decl(id, builder => {
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
