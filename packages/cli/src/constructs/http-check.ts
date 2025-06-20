import { Check, CheckProps } from './check'
import { HttpRequest } from './http-request'
import { Session } from './project'

export interface HttpCheckProps extends Omit<CheckProps, 'doubleCheck' | 'shouldFail'> {
  /**
   *  Determines the request that the check is going to run.
   */
  request: HttpRequest
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
 * Creates an HTTP Check
 */
export class HttpCheck extends Check {
  readonly request: HttpRequest
  readonly degradedResponseTime?: number
  readonly maxResponseTime?: number

  /**
   * Constructs the HTTP Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#httpcheck Read more in the docs}
   */

  constructor (logicalId: string, props: HttpCheckProps) {
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
      checkType: 'HTTP',
      request: this.request,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
