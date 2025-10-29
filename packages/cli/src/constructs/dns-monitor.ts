import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { validateResponseTimes } from './internal/common-diagnostics'
import { DnsRequest } from './dns-request'
import { RequiredPropertyDiagnostic } from './construct-diagnostics'

export interface DnsMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: DnsRequest

  /**
   * The response time in milliseconds where the monitor should be considered
   * degraded.
   *
   * DNS monitors have lower thresholds than most other checks and monitors.
   *
   * @defaultValue 500
   * @minimum 0
   * @maximum 5000
   * @example
   * ```typescript
   * degradedResponseTime: 200  // Alert when DNS request takes longer than 400 milliseconds
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where the monitor should be considered
   * failing.
   *
   * DNS monitors have lower thresholds than most other checks and monitors.
   *
   * @defaultValue 1000
   * @minimum 0
   * @maximum 5000
   * @example
   * ```typescript
   * maxResponseTime: 200  // Fail if DNS request takes longer than 200 milliseconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a DNS Monitor
 */
export class DnsMonitor extends Monitor {
  request: DnsRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the DNS Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#dnsmonitor Read more in the docs}
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

    if (this.request.nameServer && this.request.port === undefined) {
      diagnostics.add(new RequiredPropertyDiagnostic(
        'port',
        new Error(
          `A value for "port" is required when "nameServer" is set.`,
        ),
      ))
    }

    if (!this.request.nameServer && this.request.port !== undefined) {
      diagnostics.add(new RequiredPropertyDiagnostic(
        'nameServer',
        new Error(
          `A value for "nameServer" is required when "port" is set.`,
        ),
      ))
    }

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
