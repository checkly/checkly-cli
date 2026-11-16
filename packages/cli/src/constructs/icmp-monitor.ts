import { Monitor, MonitorProps } from './monitor.js'
import { Session } from './session.js'
import { Diagnostics } from './diagnostics.js'
import { IcmpRequest } from './icmp-request.js'
import { CheckIntent, CheckIntentProps } from './check.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'

// Sent for a threshold the code leaves unset. Must equal the default the API
// applies to ICMP monitors: a change of the API default has to be made here
// too.
const DEFAULT_DEGRADED_PACKET_LOSS_THRESHOLD = 10
const DEFAULT_MAX_PACKET_LOSS_THRESHOLD = 20

export interface IcmpMonitorProps extends MonitorProps, CheckIntentProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: IcmpRequest

  /**
   * The percentage of packet loss where the monitor should be considered
   * degraded.
   *
   * @defaultValue 10
   * @minimum 0
   * @maximum 100
   * @example
   * ```typescript
   * degradedPacketLossThreshold: 10  // Alert when 10% or more packets are lost
   * ```
   */
  degradedPacketLossThreshold?: number

  /**
   * The percentage of packet loss where the monitor should be considered
   * failing.
   *
   * @defaultValue 20
   * @minimum 0
   * @maximum 100
   * @example
   * ```typescript
   * maxPacketLossThreshold: 20  // Fail if 20% or more packets are lost
   * ```
   */
  maxPacketLossThreshold?: number
}

/**
 * Creates an ICMP Monitor
 */
export class IcmpMonitor extends Monitor {
  request: IcmpRequest
  degradedPacketLossThreshold?: number
  maxPacketLossThreshold?: number

  get intent (): CheckIntent | null | undefined {
    return this.checkIntent
  }

  set intent (intent: CheckIntent | null | undefined) {
    this.checkIntent = intent
  }

  /**
   * Constructs the ICMP Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/icmp-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: IcmpMonitorProps) {
    super(logicalId, props)

    this.intent = props.intent
    this.request = props.request
    this.degradedPacketLossThreshold = props.degradedPacketLossThreshold
    this.maxPacketLossThreshold = props.maxPacketLossThreshold

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `IcmpMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    // The API rejects a degraded threshold above the max threshold. An unset
    // threshold is sent as its default, so a threshold set alone is compared
    // against the default of the other.
    const degraded = this.degradedPacketLossThreshold ?? DEFAULT_DEGRADED_PACKET_LOSS_THRESHOLD
    const max = this.maxPacketLossThreshold ?? DEFAULT_MAX_PACKET_LOSS_THRESHOLD
    if (degraded > max) {
      if (this.maxPacketLossThreshold === undefined) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'degradedPacketLossThreshold',
          new Error(
            `The value of "degradedPacketLossThreshold" must be less than or equal to the default `
            + `"maxPacketLossThreshold" of ${max}. Set an explicit "maxPacketLossThreshold" `
            + `if you need a higher threshold.`,
          ),
        ))
      } else if (this.degradedPacketLossThreshold === undefined) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'maxPacketLossThreshold',
          new Error(
            `The value of "maxPacketLossThreshold" must be greater than or equal to the default `
            + `"degradedPacketLossThreshold" of ${degraded}. Set an explicit `
            + `"degradedPacketLossThreshold" if you need a lower threshold.`,
          ),
        ))
      } else {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'degradedPacketLossThreshold',
          new Error(
            `The value of "degradedPacketLossThreshold" must be less than or equal to `
            + `"maxPacketLossThreshold".`,
          ),
        ))
      }
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'ICMP',
      request: this.request,
      degradedPacketLossThreshold: this.degradedPacketLossThreshold ?? DEFAULT_DEGRADED_PACKET_LOSS_THRESHOLD,
      maxPacketLossThreshold: this.maxPacketLossThreshold ?? DEFAULT_MAX_PACKET_LOSS_THRESHOLD,
    }
  }
}
