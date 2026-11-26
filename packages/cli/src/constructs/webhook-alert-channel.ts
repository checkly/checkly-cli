import { AlertChannel, AlertChannelProps } from './alert-channel.js'
import {
  AlertChannelIntegration,
  CORALOGIX_INTEGRATION,
  DISCORD_INTEGRATION,
  FIREHYDRANT_INTEGRATION,
  GITLAB_INTEGRATION,
  ILERT_INTEGRATION,
  INCIDENTIO_INTEGRATION,
  MSTEAMS_INTEGRATION,
  ROOTLY_INTEGRATION,
  SPIKE_INTEGRATION,
  SPLUNK_INTEGRATION,
  TELEGRAM_INTEGRATION,
} from './internal/integrations.js'
import { HttpHeader } from './http-header.js'
import { HttpRequestMethod } from './http-request.js'
import { QueryParam } from './query-param.js'
import { Session } from './session.js'

export interface WebhookAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  webhookType?: string
  /**
   * The URL where to send the webhook HTTP request.
   */
  url: URL | string
  /**
   * This is commonly a JSON body. You can
   * use {@link https://www.checklyhq.com/docs/communicate/alerts/webhooks/#using-variables | Handlebars-style template variables}
   * to add custom data to the template.
   */
  template?: string
  /**
   * Either `GET`, `POST`, `PUT`, `PATCH`, `HEAD`, `DELETE` or 'OPTIONS' just like an API check.
   */
  method?: HttpRequestMethod
  /**
   * Key-value elements array with the headers to send in the webhook HTTP request.
   */
  headers?: Array<HttpHeader>
  /**
   * Key-value elements array with the query parameters to include in the URL for the webhook HTTP request.
   */
  queryParameters?: Array<QueryParam>
  /**
   * An optional value to use as the
   * {@link https://www.checklyhq.com/docs/alerting-and-retries/webhooks/#webhook-secrets secret for the webhook}.
   *
   * You may specify any value that meets your security criteria.
   */
  webhookSecret?: string
}

/**
 * The integration each webhook type delivers through. The integration types
 * must match the ones the Checkly API reports in the account's `integrations`
 * list (see `internal/integrations.ts`). A plain webhook, or one whose type is
 * not listed here, is not checked against the account's plan.
 */
const WEBHOOK_INTEGRATIONS = new Map<string, AlertChannelIntegration>([
  ['WEBHOOK_MSTEAMS', MSTEAMS_INTEGRATION],
  ['WEBHOOK_DISCORD', DISCORD_INTEGRATION],
  ['WEBHOOK_TELEGRAM', TELEGRAM_INTEGRATION],
  ['WEBHOOK_FIREHYDRANT', FIREHYDRANT_INTEGRATION],
  ['WEBHOOK_GITLAB_ALERT', GITLAB_INTEGRATION],
  ['WEBHOOK_SPIKESH', SPIKE_INTEGRATION],
  ['WEBHOOK_SPLUNK', SPLUNK_INTEGRATION],
  ['WEBHOOK_CORALOGIX', CORALOGIX_INTEGRATION],
  ['WEBHOOK_ILERT', ILERT_INTEGRATION],
  ['WEBHOOK_INCIDENTIO', INCIDENTIO_INTEGRATION],
  ['WEBHOOK_ROOTLY', ROOTLY_INTEGRATION],
])

/**
 * Creates an Webhook Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class WebhookAlertChannel extends AlertChannel {
  name: string
  webhookType?: string
  url: URL | string
  template?: string
  method?: HttpRequestMethod
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  webhookSecret?: string
  /**
   * Constructs the Webhook Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Webhook alert channel configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/webhook-alert-channel/ Read more in the docs}
   */
  constructor (logicalId: string, props: WebhookAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.webhookType = props.webhookType
    this.url = props.url
    this.template = props.template
    this.method = props.method
    this.headers = props.headers
    this.queryParameters = props.queryParameters
    this.webhookSecret = props.webhookSecret
    Session.registerConstruct(this)
  }

  describe (): string {
    return `WebhookAlertChannel:${this.logicalId}`
  }

  protected integration (): AlertChannelIntegration | undefined {
    return this.webhookType === undefined ? undefined : WEBHOOK_INTEGRATIONS.get(this.webhookType)
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
