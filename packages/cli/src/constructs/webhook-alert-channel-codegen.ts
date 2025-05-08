import { decl, expr, GeneratedFile, ident, ObjectValueBuilder, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel-codegen'
import { HttpHeader } from './http-header'
import { valueForKeyValuePair } from './key-value-pair-codegen'
import { QueryParam } from './query-param'

import { IncidentioAlertChannelCodegen } from './incidentio-alert-channel-codegen'
import { MSTeamsAlertChannelCodegen } from './msteams-alert-channel-codegen'
import { TelegramAlertChannelCodegen } from './telegram-alert-channel-codegen'
import { Codegen, Context, ImportSafetyViolation } from './internal/codegen'

export type WebhookType =
  'WEBHOOK_INCIDENTIO' |
  'WEBHOOK_TELEGRAM' |
  'WEBHOOK_MSTEAMS'

export interface WebhookAlertChannelResourceConfig {
  name: string
  webhookType?: WebhookType
  url: string
  template?: string
  method?: string
  headers?: HttpHeader[]
  queryParameters?: QueryParam[]
  webhookSecret?: string | null
}

export interface WebhookAlertChannelResource extends AlertChannelResource {
  type: 'WEBHOOK'
  config: WebhookAlertChannelResourceConfig
}

export function buildWebhookAlertChannelConfig (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  builder: ObjectValueBuilder,
  config: WebhookAlertChannelResourceConfig,
): void {
  builder.string('name', config.name)

  if (config.webhookType) {
    builder.string('webhookType', config.webhookType)
  }

  builder.string('url', config.url)

  if (config.template) {
    builder.string('template', config.template)
  }

  if (config.method) {
    builder.string('method', config.method)
  }

  if (config.headers) {
    const headers = config.headers
    if (headers.length > 0) {
      builder.array('headers', builder => {
        for (const header of headers) {
          builder.value(valueForKeyValuePair(program, genfile, context, header))
        }
      })
    }
  }

  if (config.queryParameters) {
    const queryParameters = config.queryParameters
    if (queryParameters.length > 0) {
      builder.array('queryParameters', builder => {
        for (const param of queryParameters) {
          builder.value(valueForKeyValuePair(program, genfile, context, param))
        }
      })
    }
  }

  if (config.webhookSecret) {
    builder.string('webhookSecret', config.webhookSecret)
  }
}

const construct = 'WebhookAlertChannel'

export class WebhookAlertChannelCodegen extends Codegen<WebhookAlertChannelResource> {
  incidentioCodegen: IncidentioAlertChannelCodegen
  msteamsCodegen: MSTeamsAlertChannelCodegen
  telegramCodegen: TelegramAlertChannelCodegen
  codegensByWebhookType: Record<WebhookType, Codegen<any>>

  constructor (program: Program) {
    super(program)
    this.incidentioCodegen = new IncidentioAlertChannelCodegen(program)
    this.msteamsCodegen = new MSTeamsAlertChannelCodegen(program)
    this.telegramCodegen = new TelegramAlertChannelCodegen(program)

    this.codegensByWebhookType = {
      WEBHOOK_INCIDENTIO: this.incidentioCodegen,
      WEBHOOK_MSTEAMS: this.msteamsCodegen,
      WEBHOOK_TELEGRAM: this.telegramCodegen,
    }
  }

  describe (resource: WebhookAlertChannelResource): string {
    try {
      const { webhookType } = resource.config
      if (webhookType) {
        const codegen = this.codegensByWebhookType[webhookType]
        if (codegen) {
          return codegen.describe(resource)
        }
      }
    } catch (err) {
      if (err instanceof ImportSafetyViolation) {
        // The webhook contains unsupported data for its claimed type.
        // Fall back to the standard webhook alert channel which can handle
        // all subtypes.
      } else {
        throw err
      }
    }

    return `Webhook Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: WebhookAlertChannelResource, context: Context): void {
    try {
      const { webhookType } = resource.config
      if (webhookType) {
        const codegen = this.codegensByWebhookType[webhookType]
        if (codegen) {
          codegen.prepare(logicalId, resource, context)
          return
        }
      }
    } catch (err) {
      if (err instanceof ImportSafetyViolation) {
        // The webhook contains unsupported data for its claimed type.
        // Fall back to the standard webhook alert channel which can handle
        // all subtypes.
      } else {
        throw err
      }
    }

    context.registerAlertChannel(
      resource.id,
      'webhookAlert',
      this.program.generatedConstructFile('resources/alert-channels/webhook'),
    )
  }

  gencode (logicalId: string, resource: WebhookAlertChannelResource, context: Context): void {
    try {
      const { webhookType } = resource.config
      if (webhookType) {
        const codegen = this.codegensByWebhookType[webhookType]
        if (codegen) {
          codegen.gencode(logicalId, resource, context)
          return
        }
      }
    } catch (err) {
      if (err instanceof ImportSafetyViolation) {
        // The webhook contains unsupported data for its claimed type.
        // Fall back to the standard webhook alert channel which can handle
        // all subtypes.
      } else {
        throw err
      }
    }

    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            buildWebhookAlertChannelConfig(this.program, file, context, builder, resource.config)
            buildAlertChannelProps(builder, resource)
          })
        })
      }))

      builder.export()
    }))
  }
}
