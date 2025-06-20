import { HttpAssertion } from './http-assertion'
import { HttpHeader } from './http-header'
import { IPFamily } from './ip'
import { QueryParam } from './query-param'

export type HttpRequestMethod =
  | 'get' | 'GET'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'head' | 'HEAD'
  | 'delete' | 'DELETE'
  | 'options' | 'OPTIONS'

export type BodyType = 'JSON' | 'FORM' | 'RAW' | 'GRAPHQL' | 'NONE'

export interface BasicAuth {
  username: string
  password: string
}

export interface HttpRequest {
  url: string,
  method: HttpRequestMethod,
  ipFamily?: IPFamily,
  followRedirects?: boolean,
  skipSSL?: boolean,
  /**
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Array<HttpAssertion>
  body?: string
  bodyType?: BodyType
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}

// Aliased for backwards compatibility.
export type Request = HttpRequest
