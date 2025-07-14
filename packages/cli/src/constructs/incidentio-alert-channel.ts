import { WebhookAlertChannel } from './webhook-alert-channel'
import { AlertChannelProps } from './alert-channel'

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
  /**
   * An optional custom payload. If not given,
   * `IncidentioAlertChannel.DEFAULT_PAYLOAD` will be used.
   */
  payload?: string
}

/**
 * Creates an Incident.io Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class IncidentioAlertChannel extends WebhookAlertChannel {
  static DEFAULT_PAYLOAD = `{
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
    this.headers = [
      {
        key: 'authorization',
        value: `Bearer ${props.apiKey}`,
        locked: false,
      },
    ]
    this.template = props.payload ?? IncidentioAlertChannel.DEFAULT_PAYLOAD
  }

  describe (): string {
    return `IncidentioAlertChannel:${this.logicalId}`
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
