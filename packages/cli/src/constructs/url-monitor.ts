import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { UrlRequest } from './url-request'

export interface UrlMonitorProps extends MonitorProps {
  /**
   *  Determines the request that the check is going to run.
   */
  request: UrlRequest
  /**
   * The response time in milliseconds where the monitor should be considered
   * degraded.
   */
  degradedResponseTime?: number
  /**
   * The response time in milliseconds where the monitor should be considered
   * failing.
   */
  maxResponseTime?: number
}

/**
 * Creates an HTTP Check
 */
export class UrlMonitor extends Monitor {
  readonly request: UrlRequest
  readonly degradedResponseTime?: number
  readonly maxResponseTime?: number

  /**
   * Constructs the URL Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#urlmonitor Read more in the docs}
   */

  constructor (logicalId: string, props: UrlMonitorProps) {
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
      checkType: 'URL',
      request: {
        ...this.request,
        method: 'GET',
      },
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
