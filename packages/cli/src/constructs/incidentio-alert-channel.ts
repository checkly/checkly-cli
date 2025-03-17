import { WebhookAlertChannel } from './webhook-alert-channel'
import { AlertChannelProps } from './alert-channel'
import { expr, ident, Program } from '../sourcegen'

export interface IncidentioAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  /**
   * The unique URL created by installing the Checkly integration in Incident.io.
   * {@link https://www.checklyhq.com/docs/integrations/incidentio/}
   */
  url: URL|string
  /**
   * The API key created by installing the Checkly integration in Incident.io.
   * {@link https://www.checklyhq.com/docs/integrations/incidentio/}
   */
  apiKey: string
}

/**
 * Creates an Incident.io Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class IncidentioAlertChannel extends WebhookAlertChannel {
  apiKey: string

  /**
   * Constructs the Incident.io Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Incident.io alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#incidentioalertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: IncidentioAlertChannelProps) {
    super(logicalId, props)
    this.webhookType = 'WEBHOOK_INCIDENTIO'
    this.method = 'POST'
    this.apiKey = props.apiKey
    this.headers = [
      {
        key: 'authorization',
        value: `Bearer ${props.apiKey}`,
        locked: false,
      },
    ]
    this.template = `{
  "title": "{{ALERT_TITLE}}",
  "description": "{{ALERT_TITLE}} at {{STARTED_AT}} in {{RUN_LOCATION}} {{RESPONSE_TIME}}ms",
  "deduplication_key": "{{CHECK_ID}}",
  "metadata": {
    "alertType": "{{ALERT_TYPE}}",
    "check_result_id": "{{CHECK_RESULT_ID}}",
    "resultLink": "{{RESULT_LINK}}"
  },
  {{#contains ALERT_TYPE "RECOVERY"}}
  "status": "resolved"
  {{else}}
  "status": "firing"
  {{/contains}}
}
`
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
    program.import('IncidentioAlertChannel', 'checkly/constructs')

    program.value(expr(ident('IncidentioAlertChannel'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.string('name', this.name)
          builder.string('url', this.url.toString())
          builder.string('apiKey', this.apiKey)

          this.buildSourceForAlertChannelProps(builder)
        })
      })
    }))
  }
}
