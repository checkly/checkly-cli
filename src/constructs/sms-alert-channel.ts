import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface SmsAlertChannelProps extends AlertChannelProps {
    number: string
}

export class SmsAlertChannel extends AlertChannel {
  number: string
  constructor (logicalId: string, props: SmsAlertChannelProps) {
    super(logicalId, props)
    this.number = props.number
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SMS',
      config: {
        number: this.number,
      },
    }
  }
}
