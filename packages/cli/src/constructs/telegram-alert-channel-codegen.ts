import qs from 'node:querystring'

import { Codegen, Context, ImportSafetyViolation } from './internal/codegen/index.js'
import { decl, expr, ident } from '../sourcegen/index.js'
import { buildAlertChannelProps } from './alert-channel-codegen.js'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen.js'
import { TelegramAlertChannel } from './telegram-alert-channel.js'

export interface TelegramAlertChannelResource extends WebhookAlertChannelResource {
  config: WebhookAlertChannelResourceConfig & {
    webhookType: 'WEBHOOK_TELEGRAM'
  }
}

function apiKeyFromUrl (url: string, context: Context): string | undefined {
  // A masked URL holds no key to extract; the mask stands in for it.
  if (context.isMasked(url)) {
    return url
  }

  const match = /https:\/\/api.telegram.org\/bot([^/]+)\/sendMessage/.exec(url)
  if (match) {
    return match[1]
  }
}

interface TemplateValues {
  chatId?: string
  messageThreadId?: string
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
    messageThreadId: singleValue('message_thread_id'),
    text: singleValue('text'),
  }
}

const construct = 'TelegramAlertChannel'

export class TelegramAlertChannelCodegen extends Codegen<TelegramAlertChannelResource> {
  validateSafety (resource: TelegramAlertChannelResource, context?: Context) {
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

    // The preview masks this field even when it is null, so a masked value
    // says nothing about whether a secret is set.
    if (config.webhookSecret && !context?.isMasked(config.webhookSecret)) {
      throw new ImportSafetyViolation(`Unsupported value for property 'webhookSecret' (expected no value)`)
    }
  }

  describe (resource: TelegramAlertChannelResource): string {
    this.validateSafety(resource)

    return `Telegram Alert Channel: ${resource.config.name}`
  }

  prepare (logicalId: string, resource: TelegramAlertChannelResource, context: Context): void {
    this.validateSafety(resource, context)

    const { name } = resource.config

    const filename = context.filePath('resources/alert-channels/telegram', name, {
      unique: true,
    })

    context.registerAlertChannel(
      resource.id,
      `${name} telegram`,
      this.program.generatedConstructFile(filename.fullPath),
    )
  }

  gencode (logicalId: string, resource: TelegramAlertChannelResource, context: Context): void {
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

            const apiKey = apiKeyFromUrl(config.url, context)
            if (apiKey) {
              builder.string('apiKey', apiKey)
            } else {
              throw new Error(`Failed to extract Telegram API Key from webhook template: ${config.template}`)
            }

            if (config.template) {
              const { chatId, messageThreadId, text } = parseTemplate(config.template)
              if (chatId) {
                builder.string('chatId', chatId)
              } else {
                throw new Error(`Failed to extract Telegram Chat ID from webhook template: ${config.template}`)
              }

              if (messageThreadId) {
                builder.string('messageThreadId', messageThreadId)
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
