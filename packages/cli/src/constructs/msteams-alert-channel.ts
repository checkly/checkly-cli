import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface MSTeamsAlertChannelProps extends AlertChannelProps {
  /**
   * The name of your MSTeams alert
   */
  name: string
  /**
   * The name of your MSTeams alert channel.
   */
  channel_name: string
  /**
   * The URL webhook to which to send updates.
   */
  url: string
  template?: string
}

/**
 * Creates an MSTeams Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class MSTeamsAlertChannel extends AlertChannel {
  name: string
  channel_name: string
  url: string
  template?: string

  /**
   * Constructs the MSTeams Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props MSTeams alert channel configuration properties
   * Fix following url:
   * {@link https://checklyhq.com/docs/cli/constructs/#MSTeamsalertchannel Read more in the docs}
  */
  constructor(logicalId: string, props: MSTeamsAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name;
    this.channel_name = props.channel_name;
    this.url = props.url;
    this.template = props.template || `{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.2",
        "body": [
          {
            "size": "large",
            "type": "TextBlock",
            "text": "{{ALERT_TITLE}} has failed",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Response time: {{RESPONSE_TIME}}",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Location: {{RUN_LOCATION}}",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Timestamp: {{STARTED_AT}}",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Tags: {{TAGS}}",
            "wrap": true
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "Learn More",
            "url": "https://adaptivecards.io"
          }
        ]
      }
    }
  ]
}`;
    Session.registerConstruct(this)
  }

  synthesize() {
    return {
      ...super.synthesize(),
      type: 'WEBHOOK',
      config: {
        name: this.name,
        channel_name: this.channel_name,
        url: this.url,
        template: this.template,
      },
    }
  }
}
