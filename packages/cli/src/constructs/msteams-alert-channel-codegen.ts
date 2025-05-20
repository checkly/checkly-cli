import { Codegen, Context, ImportSafetyViolation } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'
import { MSTeamsAlertChannel } from './msteams-alert-channel'

export interface MSTeamsAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_MSTEAMS'
  }
}

const construct = 'MSTeamsAlertChannel'

export class MSTeamsAlertChannelCodegen extends Codegen<MSTeamsAlertChannelResource> {
  validateSafety (resource: MSTeamsAlertChannelResource): void {
    const { config } = resource

    if (config.method !== 'POST') {
      throw new ImportSafetyViolation(`Unsupported value for property 'method' (expected 'POST')`)
    }

    if (config.headers !== undefined && config.headers.length !== 0) {
      throw new ImportSafetyViolation(`Unsupported value for property 'headers' (expected no value or an empty array)`)
    }

    if (config.queryParameters !== undefined && config.queryParameters.length !== 0) {
      throw new ImportSafetyViolation(`Unsupported value for property 'queryParameters' (expected no value or an empty array)`)
    }

    if (config.webhookSecret !== undefined) {
      throw new ImportSafetyViolation(`Unsupported value for property 'webhookSecret' (expected no value)`)
    }
  }

  describe (resource: MSTeamsAlertChannelResource): string {
    this.validateSafety(resource)

    return `Microsoft Teams Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: MSTeamsAlertChannelResource, context: Context): void {
    this.validateSafety(resource)

    const { name } = resource.config

    const filename = context.filePath('resources/alert-channels/ms-teams', name, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${name} teams`,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: MSTeamsAlertChannelResource, context: Context): void {
    this.validateSafety(resource)

    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    if (config.method !== 'POST') {
      throw new ImportSafetyViolation(`Unsupported value for property 'method' (expected 'POST')`)
    }

    if (config.headers !== undefined && config.headers.length !== 0) {
      throw new ImportSafetyViolation(`Unsupported value for property 'headers' (expected no value or an empty array)`)
    }

    if (config.queryParameters !== undefined && config.queryParameters.length !== 0) {
      throw new ImportSafetyViolation(`Unsupported value for property 'queryParameters' (expected no value or an empty array)`)
    }

    if (config.webhookSecret) {
      throw new ImportSafetyViolation(`Unsupported value for property 'webhookSecret' (expected no value)`)
    }

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', config.name)
            builder.string('url', config.url)

            if (config.template) {
              if (config.template !== MSTeamsAlertChannel.DEFAULT_PAYLOAD) {
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
