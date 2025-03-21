import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel.codegen'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel.codegen'

export interface MSTeamsAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_MSTEAMS'
  }
}

const construct = 'MSTeamsAlertChannel'

export function codegen (program: Program, logicalId: string, resource: MSTeamsAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('teamsAlert')),
  )

  const { config } = resource

  program.section(decl(id, builder => {
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
  }))
}
