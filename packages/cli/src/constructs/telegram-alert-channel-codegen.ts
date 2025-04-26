import qs from 'node:querystring'

import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'
import { TelegramAlertChannel } from './telegram-alert-channel'

export interface TelegramAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_TELEGRAM'
  }
}

function apiKeyFromUrl (url: string): string | undefined {
  const match = /https:\/\/api.telegram.org\/bot([^/]+)\/sendMessage/.exec(url)
  if (match) {
    return match[1]
  }
}

interface TemplateValues {
  chatId?: string
  text?: string
}

function parseTemplate (template: string): TemplateValues {
  const values = qs.parse(template)

  const singleValue = (key: string): string | undefined => {
    const value = values[key]
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  }

  return {
    chatId: singleValue('chat_id'),
    text: singleValue('text'),
  }
}

const construct = 'TelegramAlertChannel'

export class TelegramAlertChannelCodegen extends Codegen<TelegramAlertChannelResource> {
  prepare (logicalId: string, resource: TelegramAlertChannelResource, context: Context): void {
    context.registerAlertChannel(
      resource.id,
      'telegramAlert',
      this.program.generatedConstructFile('resources/alert-channels/telegram'),
    )
  }

  gencode (logicalId: string, resource: TelegramAlertChannelResource, context: Context): void {
    const { id, file } = context.lookupAlertChannel(resource.id)

    file.namedImport(construct, 'checkly/constructs')

    const { config } = resource

    file.section(decl(id, builder => {
      builder.variable(expr(ident(construct), builder => {
        builder.new(builder => {
          builder.string(logicalId)
          builder.object(builder => {
            builder.string('name', config.name)

            const apiKey = apiKeyFromUrl(config.url)
            if (apiKey) {
              builder.string('apiKey', apiKey)
            } else {
              throw new Error(`Failed to extract Telegram API Key from webhook template: ${config.template}`)
            }

            if (config.template) {
              const { chatId, text } = parseTemplate(config.template)
              if (chatId) {
                builder.string('chatId', chatId)
              } else {
                throw new Error(`Failed to extract Telegram Chat ID from webhook template: ${config.template}`)
              }

              if (text) {
                if (text !== TelegramAlertChannel.DEFAULT_PAYLOAD) {
                  builder.string('payload', text)
                }
              } else {
                throw new Error(`Failed to extract Telegram payload from webhook template: ${config.template}`)
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
