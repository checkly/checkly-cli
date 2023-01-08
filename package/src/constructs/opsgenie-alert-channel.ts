import { AlertChannel, AlertChannelProps } from './alert-channel'

export enum OpsgeniePriority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
  P5 = 'P5',
}

export enum OpsgenieRegion {
  EU = 'EU',
  US = 'US',
}

export interface OpsgenieAlertChannelProps extends AlertChannelProps {
  name: string
  apiKey: string
  region: OpsgenieRegion
  priority: OpsgeniePriority
}

export class OpsgenieAlertChannel extends AlertChannel {
  name: string
  apiKey: string
  region: OpsgenieRegion
  priority: OpsgeniePriority
  constructor (logicalId: string, props: OpsgenieAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.apiKey = props.apiKey
    this.region = props.region
    this.priority = props.priority
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'OPSGENIE',
      config: {
        name: this.name,
        apiKey: this.apiKey,
        region: this.region,
        priority: this.priority,
      },
    }
  }
}
