import { Assertion } from './api-assertion'
import { HttpHeader } from './http-header'
import { HttpRequestMethod } from './http-request'
import { IPFamily } from './ip'
import { QueryParam } from './query-param'

/** HTTP request body types supported by API checks */
export type BodyType = 'JSON' | 'FORM' | 'RAW' | 'GRAPHQL' | 'NONE'

/**
 * Basic authentication credentials for HTTP requests.
 */
export interface BasicAuth {
  /** Username for basic authentication */
  username: string
  /** Password for basic authentication */
  password: string
}

/**
 * Configuration for an HTTP request in an API check.
 * Defines all aspects of the HTTP request to be made.
 */
// Called Request instead of HttpRequest for historical reasons.
export interface Request {
  /** 
   * The URL to make the request to.
   * @maxLength 2048
   * @example 'https://api.example.com/users'
   */
  url: string,
  
  /** 
   * The HTTP method to use.
   * Supported methods: GET, POST, PUT, HEAD, DELETE, PATCH
   */
  method: HttpRequestMethod,
  
  /** 
   * IP family version to use for network requests.
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily,
  
  /** 
   * Whether to follow HTTP redirects automatically.
   * @defaultValue true
   */
  followRedirects?: boolean,
  
  /** 
   * Whether to skip SSL certificate verification.
   * @defaultValue false
   */
  skipSSL?: boolean,
  
  /**
   * Assertions to validate the HTTP response.
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Array<Assertion>
  
  /** The request body content */
  body?: string
  
  /** 
   * The type of the request body.
   * @defaultValue 'NONE'
   */
  bodyType?: BodyType
  
  /** HTTP headers to include in the request */
  headers?: Array<HttpHeader>
  
  /** Query parameters to include in the request URL */
  queryParameters?: Array<QueryParam>
  
  /** Basic authentication credentials */
  basicAuth?: BasicAuth
}
