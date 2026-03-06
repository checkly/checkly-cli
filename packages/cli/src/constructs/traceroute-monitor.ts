import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { TracerouteRequest } from './traceroute-request'

export interface TracerouteMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: TracerouteRequest

  /**
   * The response time in milliseconds where the monitor should be considered
   * degraded.
   *
   * @defaultValue 15000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * degradedResponseTime: 15000  // Alert when response time exceeds 15s
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where the monitor should be considered
   * failing.
   *
   * @defaultValue 30000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * maxResponseTime: 30000  // Fail if response time exceeds 30s
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a Traceroute Monitor
 */
export class TracerouteMonitor extends Monitor {
  request: TracerouteRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the Traceroute Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/traceroute-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: TracerouteMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `TracerouteMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'TRACEROUTE',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
