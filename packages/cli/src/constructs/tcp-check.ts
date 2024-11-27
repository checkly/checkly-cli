import { Check, CheckProps } from './check'
import { Session } from './project'

export interface TcpRequest {
  url: string,
  port: number
}

export interface TcpCheckProps extends CheckProps {
  /**
   *  Determines the request that the check is going to run.
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
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
