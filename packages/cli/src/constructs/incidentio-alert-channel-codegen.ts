import { Codegen, Context, ImportSafetyViolation } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { HttpHeader } from './http-header'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'
import { IncidentioAlertChannel } from './incidentio-alert-channel'

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
  validateSafety (resource: IncidentioAlertChannelResource): void {
    const { config } = resource

    if (config.method !== 'POST') {
      throw new ImportSafetyViolation(`Unsupported value for property 'method' (expected 'POST')`)
    }

    if (config.headers === undefined) {
      throw new ImportSafetyViolation(`Unsupported value for property 'headers' (expected a single 'authorization' header)`)
    }

    if (config.headers.length !== 1) {
      throw new ImportSafetyViolation(`Unsupported value for property 'headers' (expected a single 'authorization' header)`)
    }

    if (config.headers[0].key.toLowerCase() !== 'authorization') {
      throw new ImportSafetyViolation(`Unsupported value for property 'headers' (expected a single 'authorization' header)`)
    }

    if (config.queryParameters !== undefined && config.queryParameters.length !== 0) {
      throw new ImportSafetyViolation(`Unsupported value for property 'queryParameters' (expected no value or an empty array)`)
    }

    if (config.webhookSecret) {
      throw new ImportSafetyViolation(`Unsupported value for property 'webhookSecret' (expected no value)`)
    }
  }

  describe (resource: IncidentioAlertChannelResource): string {
    this.validateSafety(resource)

    return `Incident.io Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    this.validateSafety(resource)

    const { name } = resource.config

    context.registerAlertChannel(
      resource.id,
      `${name} incidentio`,
      this.program.generatedConstructFile('resources/alert-channels/incident-io'),
    )
  }

  gencode (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    this.validateSafety(resource)

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

            if (config.template) {
              if (config.template !== IncidentioAlertChannel.DEFAULT_PAYLOAD) {
                builder.string('payload', config.template)
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
