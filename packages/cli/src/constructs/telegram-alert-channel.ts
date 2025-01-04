import { HttpRequestMethod } from './api-check'
import { Session } from './project'
import { WebhookAlertChannel, WebhookAlertChannelProps } from './webhook-alert-channel'

export interface TelegramAlertChannelProps extends WebhookAlertChannelProps {
    /**
     * The name of your Telegram alert
     */
    name: string
    /**
     * The chat id of your Telegram bot.
     */
    chatId: string
    /**
     * API token for your telegram bot.
     */
    apiToken: string
}

/**
 * Creates an Telegram Alert Channel
 *
 * @remarks
 *
 * This class make use of the Webhook Alert Channel endpoints.
 */
export class TelegramAlertChannel extends WebhookAlertChannel {
  name: string
  chatId: string
  apiToken: string
  url: string
  method: HttpRequestMethod

  /**
     * Constructs the Telegram Alert Channel instance
     *
     * @param logicalId unique project-scoped resource name identification
     * @param props Telegram alert channel configuration properties
     * Fix following url:
     * {@link https://checklyhq.com/docs/cli/constructs/#Telegramalertchannel Read more in the docs}
    */
  constructor (logicalId: string, props: TelegramAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.chatId = props.chatId
    this.apiToken = props.apiToken
    this.template = props.template || `chat_id=${props.chatId}&parse_mode=HTML&text=<b>{{ALERT_TITLE}}</b> at {{STARTED_AT}} in {{RUN_LOCATION}} ({{RESPONSE_TIME}}ms)\nTags: {{#each TAGS}} <i><b>{{this}}</b></i> {{#unless @last}},{{/unless}} {{/each}}\n<a href=\"{{RESULT_LINK}}\">View check result</a>\n`
    this.url = `https://api.telegram.org/bot${props.apiToken}/sendMessage?chat_id=${props.chatId}&text=${this.template}`
    this.method = 'POST'
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'WEBHOOK_TELEGRAM',
      config: {
        name: this.name,
        chatId: this.chatId,
        apiToken: this.apiToken,
        url: this.url,
        method: this.method,
      },
    }
  }
}
