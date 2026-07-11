import { Monitor, MonitorProps } from './monitor.js'
import { Session } from './session.js'
import { Diagnostics } from './diagnostics.js'
import { validateResponseTimes } from './internal/common-diagnostics.js'
import { validateGrpcAssertion } from './grpc-assertion-validation.js'
import { GrpcRequest } from './grpc-request.js'

export interface GrpcMonitorProps extends MonitorProps {
  /**
   * Determines the request that the monitor is going to run.
   */
  request: GrpcRequest

  /**
   * The response time in milliseconds where the monitor should be considered
   * degraded.
   *
   * @defaultValue 10000
   * @minimum 0
   * @maximum 180000
   * @example
   * ```typescript
   * degradedResponseTime: 3000  // Alert when the gRPC call takes longer than 3 seconds
   * ```
   */
  degradedResponseTime?: number

  /**
   * The response time in milliseconds where the monitor should be considered
   * failing.
   *
   * @defaultValue 20000
   * @minimum 0
   * @maximum 180000
   * @example
   * ```typescript
   * maxResponseTime: 10000  // Fail if the gRPC call takes longer than 10 seconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates a gRPC Monitor
 */
export class GrpcMonitor extends Monitor {
  request: GrpcRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the gRPC Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/grpc-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: GrpcMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `GrpcMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    await validateResponseTimes(diagnostics, this, {
      // gRPC allows thresholds up to 180s (calls can run to the 180s timeout),
      // matching grpcResponseTimeLimitFields in response-time-limit-schema.ts.
      degradedResponseTime: 180_000,
      maxResponseTime: 180_000,
      // Backend default applied when maxResponseTime is omitted.
      defaultMaxResponseTime: 20_000,
    })

    for (const [index, assertion] of (this.request.assertions ?? []).entries()) {
      validateGrpcAssertion(diagnostics, assertion, index)
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'GRPC',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
