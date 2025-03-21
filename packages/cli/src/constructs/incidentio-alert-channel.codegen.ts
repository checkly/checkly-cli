import { decl, expr, ident, Program } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel.codegen'
import { HttpHeader } from './http-header'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel.codegen'

export interface IncidentioAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_INCIDENTIO'
  }
}

function apiKeyFromHeaders (headers: HttpHeader[]): string | undefined {
  for (const header of headers) {
    if (header.key.toLocaleLowerCase() !== 'authorization') {
      continue
    }

    if (!header.value.startsWith('Bearer ')) {
      continue
    }

    return header.value.replace('Bearer ', '')
  }
}

const construct = 'IncidentioAlertChannel'

export function codegen (program: Program, logicalId: string, resource: IncidentioAlertChannelResource): void {
  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('incidentioAlert')),
  )

  const { config } = resource

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('name', config.name)
          builder.string('url', config.url.toString())

          if (config.headers) {
            const apiKey = apiKeyFromHeaders(config.headers)
            if (apiKey) {
              builder.string('apiKey', apiKey)
            }
          }

          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
