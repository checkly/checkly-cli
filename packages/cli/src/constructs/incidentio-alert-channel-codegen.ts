import { Codegen, Context, ImportSafetyViolation } from './internal/codegen/index.js'
import { decl, expr, ident } from '../sourcegen/index.js'
import { buildAlertChannelProps } from './alert-channel-codegen.js'
import { HttpHeader } from './http-header.js'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen.js'
import { IncidentioAlertChannel } from './incidentio-alert-channel.js'

export interface IncidentioAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_INCIDENTIO'
  }
}

function apiKeyFromHeaders (headers: HttpHeader[], context: Context): string | undefined {
  for (const header of headers) {
    if (header.key.toLocaleLowerCase() !== 'authorization') {
      continue
    }

    // A masked header holds no key to extract; the mask stands in for it.
    if (context.isMasked(header.value)) {
      return header.value
    }

    if (!header.value.startsWith('Bearer ')) {
      continue
    }

    return header.value.replace('Bearer ', '')
  }
}

const construct = 'IncidentioAlertChannel'

export class IncidentioAlertChannelCodegen extends Codegen<IncidentioAlertChannelResource> {
  validateSafety (resource: IncidentioAlertChannelResource, context?: Context): void {
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

    // The preview masks this field even when it is null, so a masked value
    // says nothing about whether a secret is set.
    if (config.webhookSecret && !context?.isMasked(config.webhookSecret)) {
      throw new ImportSafetyViolation(`Unsupported value for property 'webhookSecret' (expected no value)`)
    }
  }

  describe (resource: IncidentioAlertChannelResource): string {
    this.validateSafety(resource)

    return `Incident.io Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    this.validateSafety(resource, context)

    const { name } = resource.config

    const filename = context.filePath('resources/alert-channels/incident-io', name, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${name} incidentio`,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: IncidentioAlertChannelResource, context: Context): void {
    this.validateSafety(resource, context)

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
              const apiKey = apiKeyFromHeaders(config.headers, context)
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
