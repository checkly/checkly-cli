import { Check, CheckProps } from './check'
import { IPFamily } from './api-check'
import { Session } from './project'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'

type TcpAssertionSource = 'TEXT_BODY' | 'RESPONSE_TIME'

export type TcpAssertion = CoreAssertion<TcpAssertionSource>

export class TcpAssertionBuilder {
  static textBody (property?: string) {
    return new GeneralAssertionBuilder<TcpAssertionSource>('TEXT_BODY', property)
  }

  static responseTime () {
    return new NumericAssertionBuilder<TcpAssertionSource>('RESPONSE_TIME')
  }
}

export interface TcpRequest {
  /**
   * The hostname the connection should be made to.
   *
   * Do not include a scheme or a port in the hostname.
   */
  hostname: string
  /**
   * The port the connection should be made to.
   */
  port: number
  /**
   * Check the main Checkly documentation on TCP assertions for specific values
   * that you can use in the "property" field.
   */
  assertions?: Array<TcpAssertion>
  /**
   * The IP family to use for the connection.
   *
   * @default "IPv4"
   */
  ipFamily?: IPFamily
  /**
   * The payload to send to the target host.
   */
  body?: string
}

export interface TcpCheckProps extends CheckProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: TcpRequest
  /**
   * The response time in milliseconds where a check should be considered degraded.
   */
  degradedResponseTime?: number
  /**
   * The response time in milliseconds where a check should be considered failing.
   */
  maxResponseTime?: number
}

/**
 * Creates an TCP Check
 *
 * @remarks
 *
 * This class make use of the TCP Checks endpoints.
 */
export class TcpCheck extends Check {
  request: TcpRequest
  degradedResponseTime?: number
  maxResponseTime?: number

  /**
   * Constructs the TCP Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs/#tcpcheck Read more in the docs}
   */

  constructor (logicalId: string, props: TcpCheckProps) {
    super(logicalId, props)

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  synthesize () {
    // Do some tricks to map user-friendly 'hostname' to API-friendly 'url'.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hostname: _hostname, ...request } = {
      ...this.request,
      url: this.request.hostname,
    }

    return {
      ...super.synthesize(),
      checkType: 'TCP',
      request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
