import { Construct } from './construct'
import { Session } from './project'

export interface AlertChannelProps {
  /**
   * Determines if an alert should be send for check recoveries.
   */
  sendRecovery?: boolean
  /**
   * Determines if an alert should be send for check failures.
   */
  sendFailure?: boolean
  /**
   * Determines if an alert should be send when a check is degraded.
   */
  sendDegraded?: boolean
  /**
   * Determines if an alert should be send for expiring SSL certificates.
   */
  sslExpiry?: boolean
  /**
   * At what moment in time to start alerting on SSL certificates.
   */
  sslExpiryThreshold?: number
}

class AlertChannelWrapper extends Construct {
  constructor (logicalId: string, physicalId: string|number) {
    super(AlertChannel.__checklyType, logicalId, physicalId)
    Session.registerConstruct(this)
  }

  synthesize () {
    return null
  }
}

/**
 * Creates an Alert Channels
 *
 * @remarks
 *
 * This class make use of the Alert Channels endpoints.
 */
export abstract class AlertChannel extends Construct {
  sendRecovery?: boolean
  sendFailure?: boolean
  sendDegraded?: boolean
  sslExpiry?: boolean
  sslExpiryThreshold?: number

  static readonly __checklyType = 'alert-channel'

  /**
   * Constructs the Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props alert channel configuration properties
   */
  constructor (logicalId: string, props: AlertChannelProps) {
    super(AlertChannel.__checklyType, logicalId)
    this.sendRecovery = props.sendRecovery
    this.sendFailure = props.sendFailure
    this.sendDegraded = props.sendDegraded
    this.sslExpiry = props.sslExpiry
    this.sslExpiryThreshold = props.sslExpiryThreshold
  }

  static fromId (id: string|number) {
    return new AlertChannelWrapper(`alert-channel-${id}`, id)
  }

  allowInChecklyConfig () {
    return true
  }

  synthesize (): any|null {
    return {
      sendRecovery: this.sendRecovery,
      sendFailure: this.sendFailure,
      sendDegraded: this.sendDegraded,
      sslExpiry: this.sslExpiry,
      sslExpiryThreshold: this.sslExpiryThreshold,
    }
  }
}
