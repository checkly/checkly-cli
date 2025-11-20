import { Monitor, MonitorProps } from './monitor'
import { IPFamily } from './ip'
import { Session } from './project'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'
import { Diagnostics } from './diagnostics'
import { validateResponseTimes } from './internal/common-diagnostics'

type TcpAssertionSource = 'RESPONSE_DATA' | 'RESPONSE_TIME'

export type TcpAssertion = CoreAssertion<TcpAssertionSource>

/**
 * Builder class for creating TCP monitor assertions.
 * Provides methods to create assertions for TCP connection responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * TcpAssertionBuilder.responseTime().lessThan(1000)
 * TcpAssertionBuilder.responseTime().greaterThan(100)
 *
 * // Response data assertions
 * TcpAssertionBuilder.responseData().contains('SMTP')
 * TcpAssertionBuilder.responseData().notContains('error')
 * ```
 */
export class TcpAssertionBuilder {
  /**
   * Creates an assertion builder for TCP response data.
   * @param property Optional property path for response data
   * @returns A general assertion builder for response data content
   */
  static responseData (property?: string) {
    return new GeneralAssertionBuilder<TcpAssertionSource>('RESPONSE_DATA', property)
  }

  /**
   * Creates an assertion builder for TCP response time.
   * @returns A numeric assertion builder for response time in milliseconds
   */
  static responseTime () {
    return new NumericAssertionBuilder<TcpAssertionSource>('RESPONSE_TIME')
  }
}

/**
 * Configuration for TCP connection requests in TCP checks.
 * Defines the connection parameters and validation rules.
 */
export interface TcpRequest {
  /**
   * The hostname the connection should be made to.
   * Do not include a scheme or a port in the hostname.
   *
   * @example 'api.example.com' | '192.168.1.1'
   */
  hostname: string

  /**
   * The port the connection should be made to.
   *
   * @minimum 1
   * @maximum 65535
   * @example 443 | 80 | 22 | 3306
   */
  port: number

  /**
   * Assertions to validate the TCP response.
   * Check the main Checkly documentation on TCP assertions for specific values
   * that you can use in the "property" field.
   */
  assertions?: Array<TcpAssertion>

  /**
   * The IP family to use for the connection.
   *
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily

  /**
   * The data to send to the target host after connection is established.
   * Used for protocol-specific handshakes or commands.
   *
   * @example 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n'
   */
  data?: string
}

export interface TcpMonitorProps extends MonitorProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: TcpRequest
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
export class TcpMonitor extends Monitor {
  request: TcpRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the TCP Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/tcp-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: TcpMonitorProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `TcpMonitor:${this.logicalId}`
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
      checkType: 'TCP',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}

// Aliases for backwards compatibility.
export {
  TcpMonitorProps as TcpCheckProps,
  TcpMonitor as TcpCheck,
}
