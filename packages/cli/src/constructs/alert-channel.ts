import { Construct } from './construct'
import { Session } from './project'

/**
 * Configuration properties for alert channels.
 * These properties control when and how alerts are sent.
 *
 * @example
 * ```typescript
 * // Alert channel with custom settings
 * {
 *   sendRecovery: true,      // Alert when check recovers (default)
 *   sendFailure: true,       // Alert when check fails (default)
 *   sendDegraded: false,     // Don't alert for degraded performance (default)
 *   sslExpiry: true,         // Alert for SSL certificate expiration
 *   sslExpiryThreshold: 7    // Alert 7 days before SSL expiry
 * }
 * ```
 */
export interface AlertChannelProps {
  /**
   * Determines if an alert should be sent for check recoveries.
   * When a failing check starts passing again, recovery alerts notify that the issue is resolved.
   *
   * @defaultValue true
   */
  sendRecovery?: boolean

  /**
   * Determines if an alert should be sent for check failures.
   * When a check fails, failure alerts notify that there's an issue requiring attention.
   *
   * @defaultValue true
   */
  sendFailure?: boolean

  /**
   * Determines if an alert should be sent when a check is degraded.
   * Degraded alerts are triggered when response times exceed the degraded threshold.
   *
   * @defaultValue false
   */
  sendDegraded?: boolean

  /**
   * Determines if an alert should be sent for expiring SSL certificates.
   * SSL expiry alerts help prevent certificate-related outages.
   *
   * @defaultValue false
   */
  sslExpiry?: boolean

  /**
   * At what moment in time to start alerting on SSL certificates.
   * Specifies how many days before expiration to send the first SSL alert.
   *
   * @defaultValue 30
   * @minimum 1
   * @maximum 30
   * @example
   * ```typescript
   * sslExpiryThreshold: 7  // Alert 7 days before SSL certificate expires
   * sslExpiryThreshold: 30 // Alert 30 days before expiration (default)
   * ```
   */
  sslExpiryThreshold?: number
}

/**
 * Creates a reference to an existing Alert Channel.
 *
 * References link existing resources to a project without managing them.
 */
export class AlertChannelRef extends Construct {
  constructor (logicalId: string, physicalId: string | number) {
    super(AlertChannel.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `AlertChannelRef:${this.logicalId}`
  }

  synthesize () {
    return null
  }
}

/**
 * Base class for creating alert channels that notify when checks fail or recover.
 *
 * Alert channels define how and when to send notifications when monitoring checks
 * fail, recover, or enter a degraded state. Checkly supports multiple alert channel types
 * including email, SMS, Slack, webhooks, and third-party integrations.
 *
 * **Plan Limitations:**
 * - **Hobby**: Up to 50 alert channels
 * - **Trial**: Up to 200 alert channels
 * - **Pay-as-you-go**: Up to 200 alert channels
 * - **Contract**: Up to 500 alert channels
 *
 * @example
 * ```typescript
 * // Email alert channel
 * const emailAlert = new EmailAlertChannel('team-email', {
 *   address: 'alerts@example.com',
 *   sendFailure: true,
 *   sendRecovery: true,
 *   sendDegraded: false
 * })
 *
 * // Slack alert channel with SSL monitoring
 * const slackAlert = new SlackAlertChannel('team-slack', {
 *   url: 'https://hooks.slack.com/services/...',
 *   sslExpiry: true,
 *   sslExpiryThreshold: 7  // Alert 7 days before SSL expiry
 * })
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/cli/constructs-reference/#alertchannel | AlertChannel API Reference}
 * @see {@link https://www.checklyhq.com/docs/alerting-and-retries/alert-channels/ | Alert Channels Documentation}
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

  static fromId (id: string | number) {
    return new AlertChannelRef(`alert-channel-${id}`, id)
  }

  allowInChecklyConfig () {
    return true
  }

  synthesize (): any | null {
    return {
      sendRecovery: this.sendRecovery,
      sendFailure: this.sendFailure,
      sendDegraded: this.sendDegraded,
      sslExpiry: this.sslExpiry,
      sslExpiryThreshold: this.sslExpiryThreshold,
    }
  }
}
