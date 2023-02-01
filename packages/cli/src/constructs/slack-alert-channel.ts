import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface SlackAlertChannelProps extends AlertChannelProps {
  url: URL
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
  url: URL
  channel?: string
  /**
   * Constructs the Slack Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Slack alert channel configuration properties
   */
  constructor (logicalId: string, props: SlackAlertChannelProps) {
    super(logicalId, props)
    this.url = props.url
    this.channel = props.channel
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
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
