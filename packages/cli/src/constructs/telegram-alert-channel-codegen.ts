import { Codegen, Context } from './internal/codegen'
import { decl, expr, ident } from '../sourcegen'
import { buildAlertChannelProps } from './alert-channel-codegen'
import { WebhookAlertChannelResource, WebhookAlertChannelResourceConfig } from './webhook-alert-channel-codegen'

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

function chatIdFromTemplate (template: string): string | undefined {
  const match = /chatId=(-?[0-9]+)/.exec(template)
  if (match) {
    return match[1]
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

            if (config.template) {
              const chatId = chatIdFromTemplate(config.template)
              if (chatId) {
                builder.string('chatId', chatId)
              }
            }

            if (config.headers) {
              const apiKey = apiKeyFromUrl(config.url)
              if (apiKey) {
                builder.string('apiKey', apiKey)
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
