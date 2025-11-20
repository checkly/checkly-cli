import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface SlackAlertChannelProps extends AlertChannelProps {
  url: URL | string
  channel?: string
}

/**
 * Creates an Slack Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class SlackAlertChannel extends AlertChannel {
  url: URL | string
  channel?: string
  /**
   * Constructs the Slack Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Slack alert channel configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/slack-alert-channel/ Read more in the docs}
   */
  constructor (logicalId: string, props: SlackAlertChannelProps) {
    super(logicalId, props)
    this.url = props.url
    this.channel = props.channel
    Session.registerConstruct(this)
  }

  describe (): string {
    return `SlackAlertChannel:${this.logicalId}`
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SLACK',
      config: {
        url: this.url,
        channel: this.channel,
      },
    }
  }
}
