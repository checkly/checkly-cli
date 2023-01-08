import { AlertChannel, AlertChannelProps } from './alert-channel'

export interface PagerdutyAlertChannelProps extends AlertChannelProps {
  account?: string
  serviceName?: string
  serviceKey: string
}

export class PagerdutyAlertChannel extends AlertChannel {
  account?: string
  serviceName?: string
  serviceKey: string
  constructor (logicalId: string, props: PagerdutyAlertChannelProps) {
    super(logicalId, props)
    this.account = props.account
    this.serviceName = props.serviceName
    this.serviceKey = props.serviceKey
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'PAGERDUTY',
      config: {
        account: this.account,
        serviceName: this.serviceName,
        serviceKey: this.serviceKey,
      },
    }
  }
}
