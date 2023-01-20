import { AlertChannel, AlertChannelProps } from './alert-channel'
import { HttpHeader } from './http-header'
import { QueryParam } from './query-param'

export interface WebhookAlertChannelProps extends AlertChannelProps {
  name: string
  webhookType?: string
  url: URL
  template?: string
  // We can create a http enum to be shared with api checks
  method?: string
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
}

export class WebhookAlertChannel extends AlertChannel {
  name: string
  webhookType?: string
  url: URL
  template?: string
  method?: string
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  constructor (logicalId: string, props: WebhookAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.webhookType = props.webhookType
    this.url = props.url
    this.template = props.template
    this.method = props.method
    this.headers = props.headers
    this.queryParameters = props.queryParameters
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
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
