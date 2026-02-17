import { WebhookAlertChannel } from './webhook-alert-channel'
import { AlertChannelProps } from './alert-channel'

export interface MSTeamsAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   * */
  name: string
  /**
   * The unique URL created by creating an integration in Microsoft Teams.
   * {@link https://www.checklyhq.com/docs/integrations/alerts/msteams/}
   */
  url: string
  /**
   * An optional custom payload. If not given,
   * `MSTeamsAlertChannel.DEFAULT_PAYLOAD` will be used.
   */
  payload?: string
}

/**
 * Creates a Microsoft Teams Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class MSTeamsAlertChannel extends WebhookAlertChannel {
  static DEFAULT_PAYLOAD = `{
  "type":"message",
  "attachments":[
    {
      "contentType":"application/vnd.microsoft.card.adaptive",
      "contentUrl":null,
      "content":{
        "$schema":"http://adaptivecards.io/schemas/adaptive-card.json",
        "type":"AdaptiveCard",
        "version":"1.2",
        "body":[
          {
            "type": "Container",
            "items": [
              {
                "type": "TextBlock",
                "text": "{{ALERT_TITLE}}",
                "weight": "Bolder",
                "size": "Large",
                "style": "heading"
              },
              {{#if AI_ANALYSIS_CLASSIFICATION}}
              {
                "type": "TextBlock",
                "text": "AI analysis",
                "weight": "Bolder",
                "size": "Default",
                "style": "heading"
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
                        "text": "{{AI_ANALYSIS_CLASSIFICATION}}",
                        "weight": "Bolder",
                        "wrap": true
                      },
                      {
                        "type": "TextBlock",
                        "text": "{{AI_ANALYSIS_ROOT_CAUSE}}",
                        "wrap": true
                      }
                    ]
                  }
                ]
              },
              {
                "type": "ActionSet",
                "actions": [
                  {
                    "type": "Action.OpenUrl",
                    "title": "Read full analysis",
                    "url": "{{AI_ANALYSIS_LINK}}",
                    "style": "positive",
                    "iconUrl": "icon:Sparkle"
                  }
                ]
              },
              {{/if}}
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
        "actions":[
          {
            "type":"Action.OpenUrl",
            "title":"View in Checkly",
            "url":"{{RESULT_LINK}}",
            "style": "positive"
          }
        ]
      }
    }
  ]
}
`

  /**
   * Constructs the Microsoft Teams Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props MSTeams alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs/#msteamsalertchannel Read more in the docs}
  */
  constructor (logicalId: string, props: MSTeamsAlertChannelProps) {
    super(logicalId, props)
    this.webhookType = 'WEBHOOK_MSTEAMS'
    this.method = 'POST'
    this.template = props.payload ?? MSTeamsAlertChannel.DEFAULT_PAYLOAD
  }

  describe (): string {
    return `MSTeamsAlertChannel:${this.logicalId}`
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
