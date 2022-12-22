import { Construct } from './construct'

export interface AlertChannelProps {
    sendRecovery: boolean
    sendFailure: boolean
    sendDegraded: boolean
    sslExpiry: boolean
    sslExpiryThreshold: number
  }

export abstract class AlertChannel extends Construct {
  sendRecovery: boolean
  sendFailure: boolean
  sendDegraded: boolean
  sslExpiry: boolean
  sslExpiryThreshold: number

  static readonly __checklyType = 'alertChannels'

  constructor (logicalId: string, props: AlertChannelProps) {
    super(logicalId)
    this.sendRecovery = props.sendRecovery
    this.sendFailure = props.sendFailure
    this.sendDegraded = props.sendDegraded
    this.sslExpiry = props.sslExpiry
    this.sslExpiryThreshold = props.sslExpiryThreshold
  }

  synthesize () {
    return {
      sendRecovery: this.sendRecovery,
      sendFailure: this.sendFailure,
      sendDegraded: this.sendDegraded,
      sslExpiry: this.sslExpiry,
      sslExpiryThreshold: this.sslExpiryThreshold,
    }
  }
}
