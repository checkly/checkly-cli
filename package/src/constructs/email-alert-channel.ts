import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface EmailAlertChannelProps extends AlertChannelProps {
    address: string
}

export class EmailAlertChannel extends AlertChannel {
  address: string
  constructor (logicalId: string, props: EmailAlertChannelProps) {
    super(logicalId, props)
    this.address = props.address
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'EMAIL',
      config: {
        address: this.address,
      },
    }
  }
}
