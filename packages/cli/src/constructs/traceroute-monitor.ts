import { Monitor, MonitorProps } from './monitor.js'
import { IPFamily } from './ip.js'
import { Session } from './session.js'
import { Assertion as CoreAssertion, NumericAssertionBuilder } from './internal/assertion.js'
import { Diagnostics } from './diagnostics.js'
import { validateResponseTimes } from './internal/common-diagnostics.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

/**
 * The statistical property of the per-hop response time to assert on.
 * Required by the public API when the assertion source is `RESPONSE_TIME`.
 */
type TracerouteResponseTimeProperty = 'avg' | 'min' | 'max' | 'stdDev'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

/**
 * Builder class for creating traceroute monitor assertions.
 * Provides methods to assert on the probe response time, the number of hops
 * to the target, and the measured packet loss.
 *
 * @example
 * ```typescript
 * // Response time assertions (a property is required: avg | min | max | stdDev)
 * TracerouteAssertionBuilder.responseTime('avg').lessThan(2000)
 *
 * // Hop count assertions
 * TracerouteAssertionBuilder.hopCount().lessThan(20)
 *
 * // Packet loss assertions (percentage)
 * TracerouteAssertionBuilder.packetLoss().lessThan(5)
 * ```
 */
export class TracerouteAssertionBuilder {
  /**
   * Creates an assertion builder for the traceroute response time.
   * @param property The response-time statistic to assert on. Required by the
   * public API for `RESPONSE_TIME` assertions.
   * @returns A numeric assertion builder for response time in milliseconds
   */
  static responseTime (property: TracerouteResponseTimeProperty) {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', property)
  }

  /**
   * Creates an assertion builder for the number of hops to the target.
   * @returns A numeric assertion builder for the hop count
   */
  static hopCount () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('HOP_COUNT')
  }

  /**
   * Creates an assertion builder for the measured packet loss (percentage).
   * @returns A numeric assertion builder for packet loss
   */
  static packetLoss () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('PACKET_LOSS')
  }
}

/**
 * The transport protocol used to send the traceroute probes.
 */
export type TracerouteProtocol = 'TCP' | 'ICMP' | 'UDP' | 'SCTP'

/**
 * Configuration for the traceroute probe in a traceroute check.
 * Defines the target, protocol and probe parameters.
 *
 * Note: traceroute monitors do **not** support private locations.
 */
export interface TracerouteRequest {
  /**
   * The host the traceroute should be run against.
   * Do not include a scheme or a port in the host.
   *
   * @example 'api.example.com' | '192.168.1.1'
   */
  url: string

  /**
   * The transport protocol used to send the probes.
   *
   * @defaultValue 'TCP'
   */
  protocol?: TracerouteProtocol

  /**
   * The port the probes should target. Ignored (and stripped by the API) when
   * `protocol` is `'ICMP'`.
   *
   * @minimum 1
   * @maximum 65535
   * @defaultValue 443
   */
  port?: number

  /**
   * The IP family to use for the connection.
   *
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily

  /**
   * The maximum number of hops (TTL) to probe.
   *
   * @minimum 1
   * @maximum 64
   * @defaultValue 30
   */
  maxHops?: number

  /**
   * The maximum number of consecutive unresponsive hops to traverse before
   * giving up.
   *
   * @minimum 1
   * @maximum 30
   * @defaultValue 15
   */
  maxUnknownHops?: number

  /**
   * Whether to perform a reverse-DNS (PTR) lookup for each hop.
   *
   * @defaultValue true
   */
  ptrLookup?: boolean

  /**
   * The probe timeout in seconds.
   *
   * @minimum 1
   * @maximum 30
   * @defaultValue 10
   */
  timeout?: number

  /**
   * Assertions to validate the traceroute result.
   * Check the main Checkly documentation on traceroute assertions for specific
   * values that you can use in the "property" field.
   */
  assertions?: Array<TracerouteAssertion>
}

export interface TracerouteMonitorProps extends MonitorProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: TracerouteRequest

  /**
   * The response time in milliseconds where a check should be considered
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
   * The response time in milliseconds where a check should be considered
   * failing.
   *
   * @defaultValue 20000
   * @minimum 0
   * @maximum 30000
   * @example
   * ```typescript
   * maxResponseTime: 25000  // Fail check if the traceroute takes longer than 25 seconds
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
    })
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

// Aliases for backwards compatibility.
export {
  TracerouteMonitorProps as TracerouteCheckProps,
  TracerouteMonitor as TracerouteCheck,
}
