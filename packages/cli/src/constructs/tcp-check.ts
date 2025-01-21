import { Check, CheckProps } from './check'
import { Session } from './project'

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
    return {
      ...super.synthesize(),
      checkType: 'TCP',
      request: {
        url: this.request.hostname, // Hide misleading naming from the user.
        port: this.request.port,
      },
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
