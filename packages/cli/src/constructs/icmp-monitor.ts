import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { IcmpRequest } from './icmp-request'

export interface IcmpMonitorProps extends MonitorProps {
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
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'ICMP',
      request: this.request,
      degradedPacketLossThreshold: this.degradedPacketLossThreshold,
      maxPacketLossThreshold: this.maxPacketLossThreshold,
    }
  }
}
