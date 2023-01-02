import { Check, CheckProps } from './check'

import KeyValuePair from './key-value-pair'
export type QueryParamProps = KeyValuePair
export type HeaderProps = KeyValuePair
export interface Assertion {
  source: string,
  property: string,
  comparison: string,
  target: string
  regex: string
}

enum BodyType {
  JSON,
  FORM,
  RAW,
  GRAPHQL,
  NONE
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
  headers?: Array<HeaderProps>
  queryParams?: Array<QueryParamProps>
  basicAuth?: BasicAuth
}
export interface ApiCheckProps extends CheckProps {
  request: Request
}

export class ApiCheck extends Check {
  request: Request

  constructor (logicalId: string, props: ApiCheckProps) {
    super(logicalId, props)
    this.request = props.request
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
    }
  }
}
