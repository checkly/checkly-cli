import { Monitor, MonitorProps } from './monitor.js'
import { Session } from './session.js'
import { Diagnostics } from './diagnostics.js'
import { validateResponseTimes } from './internal/common-diagnostics.js'
import { validateTracerouteAssertion } from './traceroute-assertion-validation.js'
import { TracerouteRequest } from './traceroute-request.js'

export interface TracerouteMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: TracerouteRequest

  /**
   * The response time in milliseconds where the monitor should be considered
   * degraded.
   *
   * @defaultValue 10000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * degradedResponseTime: 5000  // Alert when the traceroute takes longer than 5 seconds
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where the monitor should be considered
   * failing.
   *
   * @defaultValue 20000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * maxResponseTime: 20000  // Fail if the traceroute takes longer than 20 seconds
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

    await validateResponseTimes(diagnostics, this, {
      degradedResponseTime: 30_000,
      maxResponseTime: 30_000,
      // Backend default applied when maxResponseTime is omitted.
      defaultMaxResponseTime: 20_000,
    })

    for (const [index, assertion] of (this.request.assertions ?? []).entries()) {
      validateTracerouteAssertion(diagnostics, assertion, index)
    }
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
