import { AlertChannel, AlertChannelProps } from './alert-channel.js'
import { Session } from './project.js'

export interface SlackAppAlertChannelProps extends AlertChannelProps {
  slackChannels: string[]
}

/**
 * Creates a Checkly Slack App Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class SlackAppAlertChannel extends AlertChannel {
  slackChannels: string[]
  /**
   * Constructs the Slack App Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Slack App alert channel configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/slack-app-alert-channel/ Read more in the docs}
   */
  constructor (logicalId: string, props: SlackAppAlertChannelProps) {
    super(logicalId, props)
    this.slackChannels = props.slackChannels
    Session.registerConstruct(this)
  }

  describe (): string {
    return `SlackAppAlertChannel:${this.logicalId}`
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SLACK_APP',
      config: {
        slackChannels: this.slackChannels,
      },
    }
  }
}
