import { AlertChannel, AlertChannelProps } from './alert-channel'
import { HttpHeader } from './http-header'
import { HttpRequestMethod } from './api-check'
import { QueryParam } from './query-param'
import { Session } from './project'
import { WebhookAlertChannel, WebhookAlertChannelProps } from './webhook-alert-channel'

export interface TelegramAlertChannelProps extends AlertChannelProps {
    /**
     * The name of your Telegram alert
     */
    name: string
    /**
     * The chat id of your Telegram bot.
     */
    chat_id: string
    /**
     * API token for your telegram bot.
     */
    api_token: string

    /**
     * An optional template for use in the GET URL.
     */
    template?: string
}

/**
 * Creates an Telegram Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class TelegramAlertChannel extends AlertChannel {
    name: string
    chat_id: string
    api_token: string
    template?: string
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
    constructor(logicalId: string, props: TelegramAlertChannelProps) {
        super(logicalId, props)
        this.name = props.name;
        this.chat_id = props.chat_id;
        this.api_token = props.api_token;
        this.template = props.template || `{{ALERT_TITLE}} at {{STARTED_AT}} in {{RUN_LOCATION}} ({{RESPONSE_TIME}}ms) Tags: {{#each TAGS}} {{this}} {{#unless @last}},{{/unless}} {{/each}} View check result: {{RESULT_LINK}}`;
        this.url = `https://api.telegram.org/bot${props.api_token}/sendMessage?chat_id=${props.chat_id}&text=${this.template}`;
        this.method = 'GET';
        Session.registerConstruct(this)
    }

    synthesize() {
        return {
            ...super.synthesize(),
            type: 'WEBHOOK',
            config: {
                name: this.name,
                chat_id: this.chat_id,
                api_token: this.api_token,
                url: this.url,
                template: this.template,
                method: this.method,
            },
        }
    }
}


