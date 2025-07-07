import { Assertion } from './api-assertion'
import { HttpHeader } from './http-header'
import { HttpRequestMethod } from './http-request'
import { IPFamily } from './ip'
import { QueryParam } from './query-param'

export type BodyType = 'JSON' | 'FORM' | 'RAW' | 'GRAPHQL' | 'NONE'

export interface BasicAuth {
  username: string
  password: string
}

// Called Request instead of HttpRequest for historical reasons.
export interface Request {
  url: string,
  method: HttpRequestMethod,
  ipFamily?: IPFamily,
  followRedirects?: boolean,
  skipSSL?: boolean,
  /**
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Array<Assertion>
  body?: string
  bodyType?: BodyType
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}
