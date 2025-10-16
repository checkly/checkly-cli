import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { validateResponseTimes } from './internal/common-diagnostics'
import { DnsRequest } from './dns-request'

export interface DnsMonitorProps extends MonitorProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: DnsRequest

  /**
   * The response time in milliseconds where a check should be considered degraded.
   * TCP checks have lower thresholds than HTTP checks due to protocol differences.
   *
   * @defaultValue 4000
   * @minimum 0
   * @maximum 5000
   * @example
   * ```typescript
   * degradedResponseTime: 1000  // Alert when TCP connection takes longer than 1 second
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where a check should be considered failing.
   * Maximum allowed value is lower for TCP checks compared to HTTP checks.
   *
   * @defaultValue 5000
   * @minimum 0
   * @maximum 5000
   * @example
   * ```typescript
   * maxResponseTime: 3000  // Fail check if TCP connection takes longer than 3 seconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a TCP Monitor
 */
export class DnsMonitor extends Monitor {
  request: DnsRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the TCP Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#tcpmonitor Read more in the docs}
   */

  constructor (logicalId: string, props: DnsMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `DnsMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    await validateResponseTimes(diagnostics, this, {
      degradedResponseTime: 5_000,
      maxResponseTime: 5_000,
    })
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'DNS',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
