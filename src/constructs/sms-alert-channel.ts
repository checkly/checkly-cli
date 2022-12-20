import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface SmsAlertChannelProps extends AlertChannelProps {
    phoneNumber: string
}

export class SmsAlertChannel extends AlertChannel {
  phoneNumber: string
  constructor (logicalId: string, props: SmsAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SMS',
      config: {
        number: this.phoneNumber,
      },
    }
  }
}
