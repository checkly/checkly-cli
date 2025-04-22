import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { HttpHeader } from './http-header'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'

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

export class IncidentioAlertChannelCodegen extends Codegen<IncidentioAlertChannelResource> {
  prepare (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    context.registerAlertChannel(
      resource.id,
      'incidentioAlert',
      this.program.generatedConstructFile('resources/alert-channels/incident-io'),
    )
  }

  gencode (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', config.name)
            builder.string('url', config.url)

            if (config.headers) {
              const apiKey = apiKeyFromHeaders(config.headers)
              if (apiKey) {
                builder.string('apiKey', apiKey)
              } else {
                throw new Error(`Failed to extract incident.io API Key from webhook headers`)
              }
            }

            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
