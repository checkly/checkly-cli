import { Check, CheckProps } from './check'
import { HttpHeader } from './http-header'
import { QueryParam } from './query-param'
export interface Assertion {
  source: string,
  property: string,
  comparison: string,
  target: string
  regex: string
}

enum BodyType {
  JSON = 'JSON',
  FORM = 'FORM',
  RAW = 'RAW',
  GRAPHQL = 'GRAPHQL',
  NONE = 'NONE'
}

export type HttpRequestMethod =
  | 'get' | 'GET'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'head' | 'HEAD'
  | 'delete' | 'DELETE'
  | 'options' | 'OPTIONS'

interface BasicAuth {
  username: string
  password: string
}

export interface Request {
  url: string,
  method: HttpRequestMethod,
  followRedirects: boolean,
  skipSsl: boolean,
  /**
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions: Array<Assertion>
  body?: string
  bodyType?: BodyType
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}
export interface ApiCheckProps extends CheckProps {
  /**
   *  Determines the request that the check is going to run.
   */
  request: Request
  /**
   * A valid piece of Node.js code to run in the setup phase.
   */
  localSetupScript?: string
  /**
   * A valid piece of Node.js code to run in the teardown phase.
   */
  localTearDownScript?: string
  /**
   * The response time in milliseconds where a check should be considered degraded.
   */
  degradedResponseTime: number
  /**
   * The response time in milliseconds where a check should be considered failing.
   */
  maxResponseTime: number
}

/**
 * Creates an API Check
 *
 * @remarks
 *
 * This class make use of the API Checks endpoints
 * listed {@link https://developers.checklyhq.com/reference/postv1checksapi here}
 */
export class ApiCheck extends Check {
  request: Request
  localSetupScript?: string
  localTearDownScript?: string
  degradedResponseTime: number
  maxResponseTime: number

  /**
   * Constructs the API Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   */
  constructor (logicalId: string, props: ApiCheckProps) {
    super(logicalId, props)
    this.request = props.request
    this.localSetupScript = props.localSetupScript
    this.localTearDownScript = props.localTearDownScript
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
      localSetupScript: this.localSetupScript,
      localTearDownScript: this.localTearDownScript,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
