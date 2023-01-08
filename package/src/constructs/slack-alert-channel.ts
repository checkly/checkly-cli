import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface SlackAlertChannelProps extends AlertChannelProps {
  url: URL
  channel?: string
}

export class SlackAlertChannel extends AlertChannel {
  url: URL
  channel?: string
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
