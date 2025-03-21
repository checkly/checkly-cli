import { decl, expr, ident, ObjectValueBuilder, Program } from '../sourcegen'
import { buildAlertChannelProps, AlertChannelResource } from './alert-channel.codegen'
import { HttpHeader } from './http-header'
import { valueForKeyValuePair } from './key-value-pair.codegen'
import { QueryParam } from './query-param'

import { codegen as incidentioAlertChannelCodegen, IncidentioAlertChannelResource } from './incidentio-alert-channel.codegen'
import { codegen as msteamsAlertChannelCodegen, MSTeamsAlertChannelResource } from './msteams-alert-channel.codegen'
import { codegen as telegramAlertChannelCodegen, TelegramAlertChannelResource } from './telegram-alert-channel.codegen'

export interface WebhookAlertChannelResourceConfig {
  name: string
  webhookType?: string
  url: string
  template?: string
  method?: string
  headers?: HttpHeader[]
  queryParameters?: QueryParam[]
  webhookSecret?: string
}

export interface WebhookAlertChannelResource extends AlertChannelResource {
  type: 'WEBHOOK'
  config: WebhookAlertChannelResourceConfig
}

export function buildWebhookAlertChannelConfig (
  builder: ObjectValueBuilder,
  config: WebhookAlertChannelResourceConfig,
): void {
  builder.string('name', config.name)

  if (config.webhookType) {
    builder.string('webhookType', config.webhookType)
  }

  builder.string('url', config.url.toString())

  if (config.template) {
    builder.string('template', config.template)
  }

  if (config.method) {
    builder.string('method', config.method)
  }

  if (config.headers) {
    const headers = config.headers
    builder.array('headers', builder => {
      for (const header of headers) {
        builder.value(valueForKeyValuePair(header))
      }
    })
  }

  if (config.queryParameters) {
    const queryParameters = config.queryParameters
    builder.array('queryParameters', builder => {
      for (const param of queryParameters) {
        builder.value(valueForKeyValuePair(param))
      }
    })
  }

  if (config.webhookSecret) {
    builder.string('webhookSecret', config.webhookSecret)
  }
}

type WebhookType = 'WEBHOOK_INCIDENTIO' | 'WEBHOOK_TELEGRAM' | 'WEBHOOK_MSTEAMS'

const codegensByWebhookType = {
  WEBHOOK_INCIDENTIO: (program: Program, logicalId: string, resource: WebhookAlertChannelResource) => {
    return incidentioAlertChannelCodegen(program, logicalId, resource as IncidentioAlertChannelResource)
  },
  WEBHOOK_MSTEAMS: (program: Program, logicalId: string, resource: WebhookAlertChannelResource) => {
    return msteamsAlertChannelCodegen(program, logicalId, resource as MSTeamsAlertChannelResource)
  },
  WEBHOOK_TELEGRAM: (program: Program, logicalId: string, resource: WebhookAlertChannelResource) => {
    return telegramAlertChannelCodegen(program, logicalId, resource as TelegramAlertChannelResource)
  },
}

const construct = 'WebhookAlertChannel'

export function codegen (program: Program, logicalId: string, resource: WebhookAlertChannelResource): void {
  if (resource.config.webhookType) {
    const subgen = codegensByWebhookType[resource.config.webhookType as WebhookType]
    if (subgen) {
      return subgen(program, logicalId, resource)
    }
  }

  program.import(construct, 'checkly/constructs')

  const id = program.registerVariable(
      `${construct}::${logicalId}`,
      ident(program.nth('webhookAlert')),
  )

  program.section(decl(id, builder => {
    builder.variable(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          buildWebhookAlertChannelConfig(builder, resource.config)
          buildAlertChannelProps(builder, resource)
        })
      })
    }))
  }))
}
