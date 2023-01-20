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

interface BasicAuth {
  username: string
  password: string
}

export interface Request {
  url: string,
  method: string,
  followRedirects: boolean,
  skipSsl: boolean,
  assertions: Array<Assertion>
  body?: string
  bodyType?: BodyType
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}
export interface ApiCheckProps extends CheckProps {
  request: Request
  localSetupScript?: string
  localTearDownScript?: string
  degradedResponseTime: number
  maxResponseTime: number
}

export class ApiCheck extends Check {
  request: Request
  localSetupScript?: string
  localTearDownScript?: string
  degradedResponseTime: number
  maxResponseTime: number

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
