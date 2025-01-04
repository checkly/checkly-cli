import { Session } from './project'
import { WebhookAlertChannel, WebhookAlertChannelProps } from './webhook-alert-channel'

export interface MSTeamsAlertChannelProps extends WebhookAlertChannelProps {
  /**
   * The name of your MSTeams alert
   */
  name: string
  /**
   * The URL webhook to which to send updates.
   */
  url: string
}

/**
 * Creates an MSTeams Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class MSTeamsAlertChannel extends WebhookAlertChannel {
  name: string
  url: string

  /**
   * Constructs the MSTeams Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props MSTeams alert channel configuration properties
   * Fix following url:
   * {@link https://checklyhq.com/docs/cli/constructs/#MSTeamsalertchannel Read more in the docs}
  */
  constructor (logicalId: string, props: MSTeamsAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.url = props.url
    this.template = props.template || `{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.2",
        "body": [
          {
            "type": "Container",
            "items": [
              {
                "type": "TextBlock",
                "text": "{{ALERT_TITLE}}",
                "weight": "bolder",
                "size": "medium"
              },
              {
                "type": "ColumnSet",
                "columns": [
                  {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                      {
                        "type": "TextBlock",
                        "text": "Response time: {{RESPONSE_TIME}}ms",
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
                      {{#if GROUP_NAME}}
                      {
                        "type": "TextBlock",
                        "text": "Group: {{GROUP_NAME}}",
                        "wrap": true
                      },
                      {{/if}}
                      {
                        "type": "TextBlock",
                        "text": "Tags: {{#each TAGS}} {{this}} {{#unless @last}},{{/unless}} {{/each}}",
                        "wrap": true
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "View in Checkly",
            "url": "{{RESULT_LINK}}"
          }
        ]
      }
    }
  ]
}`
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'WEBHOOK_MSTEAMS',
      config: {
        name: this.name,
        url: this.url,
      },
    }
  }
}
