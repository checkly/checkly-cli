import { AlertChannel, AlertChannelProps } from './alert-channel'
import { HttpHeader } from './http-header'
import { HttpRequestMethod } from './api-check'
import { QueryParam } from './query-param'
import { Session } from '../internal-constructs'

export interface WebhookAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  webhookType?: string
  /**
   * The URL where to send the webhook HTTP request.
   */
  url: URL
  /**
   * This is commonly a JSON body. You can
   * use {@link https://www.checklyhq.com/docs/alerting/webhooks/#using-variables Handlebars-style template variables}
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
}

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
  url: URL
  template?: string
  method?: HttpRequestMethod
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  /**
   * Constructs the Webhook Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Webhook alert channel configuration properties
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
    Session.registerConstruct(this)
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
      },
    }
  }
}
