import { WebhookAlertChannel } from './webhook-alert-channel'
import { AlertChannelProps } from './alert-channel'

export interface TelegramAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  /**
   * The chat ID of your Telegram bot.
   * {@link https://www.checklyhq.com/docs/integrations/telegram/}
   */
  chatId: string
  /**
   * The API key for your Telegram bot.
   * {@link https://www.checklyhq.com/docs/integrations/telegram/}
   */
  apiKey: string
  /**
   * An optional custom payload. If not given,
   * `TelegramAlertChannel.DEFAULT_PAYLOAD` will be used.
   */
  payload?: string
}

/**
 * Creates a Telegram Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class TelegramAlertChannel extends WebhookAlertChannel {
  static DEFAULT_PAYLOAD = `<b>{{ALERT_TITLE}}</b> at {{STARTED_AT}} in {{RUN_LOCATION}} ({{RESPONSE_TIME}}ms)
Tags: {{#each TAGS}} <i><b>{{this}}</b></i> {{#unless @last}},{{/unless}} {{/each}}
<a href="{{RESULT_LINK}}">View check result</a>
`

  /**
     * Constructs the Telegram Alert Channel instance
     *
     * @param logicalId unique project-scoped resource name identification
     * @param props Telegram alert channel configuration properties
     * Fix following url:
     * {@link https://checklyhq.com/docs/cli/constructs/#telegramalertchannel Read more in the docs}
    */
  constructor (logicalId: string, props: TelegramAlertChannelProps) {
    // @ts-ignore
    super(logicalId, props)
    this.webhookType = 'WEBHOOK_TELEGRAM'
    this.method = 'POST'
    const payload = props.payload ?? TelegramAlertChannel.DEFAULT_PAYLOAD
    // For historical reasons the payload is not escaped even though it
    // should be.
    this.template = `chat_id=${props.chatId}&parse_mode=HTML&text=${payload}`
    this.url = `https://api.telegram.org/bot${props.apiKey}/sendMessage`
  }

  describe (): string {
    return `TelegramAlertChannel:${this.logicalId}`
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'WEBHOOK',
      config: {
        name: this.name,
        webhookType: this.webhookType,
        url: this.url,
        template: this.template,
        method: this.method,
        headers: this.headers,
        queryParameters: this.queryParameters,
        webhookSecret: this.webhookSecret,
      },
    }
  }
}
