import { Construct } from './construct'
import { Session } from './project'

export interface AlertChannelProps {
  /**
   * Determines if an alert should be send for check recoveries.
   *
   * If not given, the default is `true`.
   */
  sendRecovery?: boolean
  /**
   * Determines if an alert should be send for check failures.
   *
   * If not given, the default is `true`.
   */
  sendFailure?: boolean
  /**
   * Determines if an alert should be send when a check is degraded.
   *
   * If not given, the default is `false`.
   */
  sendDegraded?: boolean
  /**
   * Determines if an alert should be send for expiring SSL certificates.
   *
   * If not given, the default is `false`.
   */
  sslExpiry?: boolean
  /**
   * At what moment in time to start alerting on SSL certificates.
   *
   * If not given, the default is `30` (i.e. 30 days).
   */
  sslExpiryThreshold?: number
}

/**
 * Creates a reference to an existing Alert Channel.
 *
 * References link existing resources to a project without managing them.
 */
export class AlertChannelRef extends Construct {
  constructor (logicalId: string, physicalId: string|number) {
    super(AlertChannel.__checklyType, logicalId, physicalId, false)
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
    return new AlertChannelRef(`alert-channel-${id}`, id)
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
