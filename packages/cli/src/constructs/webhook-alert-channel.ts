import { AlertChannel, AlertChannelProps } from './alert-channel'
import { HttpHeader } from './http-header'
import { HttpRequestMethod } from './api-check'
import { QueryParam } from './query-param'
import { Session } from './project'
import { decl, expr, ident, Program } from '../sourcegen'
import { sourceForKeyValuePair } from './key-value-pair'

export interface WebhookAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  webhookType?: string
  /**
   * The URL where to send the webhook HTTP request.
   */
  url: URL|string
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
  /**
   * An optional value to use as the
   * {@link https://www.checklyhq.com/docs/alerting-and-retries/webhooks/#webhook-secrets secret for the webhook}.
   *
   * You may specify any value that meets your security criteria.
   */
  webhookSecret?: string
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
  url: URL|string
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
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#webhookalertchannel Read more in the docs}
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

  source (program: Program): void {
    program.import('WebhookAlertChannel', 'checkly/constructs')

    const id = program.registerVariable(
      `WebhookAlertChannel::${this.logicalId}`,
      ident(program.nth('webhookAlertChannel')),
    )

    program.section(decl(id, builder => {
      builder.variable(expr(ident('WebhookAlertChannel'), builder => {
        builder.new(builder => {
          builder.string(this.logicalId)
          builder.object(builder => {
            builder.string('name', this.name)

            if (this.webhookType) {
              builder.string('webhookType', this.webhookType)
            }

            builder.string('url', this.url.toString())

            if (this.template) {
              builder.string('template', this.template)
            }

            if (this.method) {
              builder.string('method', this.method)
            }

            if (this.headers) {
              const headers = this.headers
              builder.array('headers', builder => {
                for (const header of headers) {
                  builder.value(sourceForKeyValuePair(header))
                }
              })
            }

            if (this.queryParameters) {
              const queryParameters = this.queryParameters
              builder.array('queryParameters', builder => {
                for (const param of queryParameters) {
                  builder.value(sourceForKeyValuePair(param))
                }
              })
            }

            if (this.webhookSecret) {
              builder.string('webhookSecret', this.webhookSecret)
            }

            this.buildSourceForAlertChannelProps(builder)
          })
        })
      }))
    }))
  }
}
