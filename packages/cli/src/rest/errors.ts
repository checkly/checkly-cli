import { isAxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getProxyUrl } from '../services/proxy.js'

export abstract class ApiError extends Error {
  data: ErrorData

  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data.message, options)
    this.name = 'ApiError'
    this.data = data
  }
}

/**
 * Error thrown when an API response indicates that the request was not valid.
 */
export class ValidationError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'ValidationError'
  }
}

/**
 * Error thrown when an API response indicates that the request was not
 * authorized.
 */
export class UnauthorizedError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Error thrown when an API response indicates that the operation exceeded
 * the capabilities of the user's payment plan. Examples include:
 *
 *   - Using features not included in the user's plan
 *   - Exceeding the resource limits of the plan
 */
export class InadequateEntitlementsError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'InadequateEntitlementsError'
  }
}

/**
 * Error thrown when an API response indicates that the requested resource
 * could not be found.
 */
export class NotFoundError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'NotFoundError'
  }
}

/**
 * Error thrown when an API response indicates that the request was not
 * allowed.
 */
export class ForbiddenError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'ForbiddenError'
  }
}

/**
 * Error thrown when an API response indicates that the request conflicts
 * with server state.
 */
export class ConflictError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'ConflictError'
  }
}

/**
 * Error thrown when an API response indicates a server error.
 */
export class ServerError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'ServerError'
  }
}

/**
 * Error thrown when an API response indicates an error that is not handled
 * globally.
 */
export class MiscellaneousError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'MiscellaneousError'
  }
}

/**
 * Error thrown when an API request times out.
 */
export class RequestTimeoutError extends ApiError {
  constructor (data: ErrorData, options?: ErrorOptions) {
    super(data, options)
    this.name = 'RequestTimeoutError'
  }
}

export interface ErrorData {
  statusCode: number
  error: string
  errorCode?: string
  message: string
  /**
   * Set on a 409 from the async project-deploy endpoint: the id of the in-flight
   * deployment that blocked this one. Lets the client attach to or cancel it.
   */
  deploymentId?: string
}

function isErrorData (value: any): value is ErrorData {
  const o = Object(value)
  return 'statusCode' in o
    && 'error' in o
    && 'message' in o
}

export interface ErrorDataOptions {
  statusCode: number
}

export function parseErrorData (data: any, options: ErrorDataOptions): ErrorData | undefined {
  if (isErrorData(data)) {
    return {
      ...data,

      // Prefer the actual HTTP status code from the options just in case the
      // payload doesn't match.
      statusCode: options.statusCode,
    }
  }

  if (isErrorOnlyErrorData(data)) {
    return normalizeErrorOnlyErrorData(data, options)
  }

  if (isMessageAndErrorCodeErrorData(data)) {
    return normalizeMessageAndErrorCodeErrorData(data, options)
  }

  if (isStringErrorData(data)) {
    return normalizeStringErrorData(data, options)
  }
}

interface ErrorOnlyErrorData {
  error: string
}

function isErrorOnlyErrorData (value: any): value is ErrorOnlyErrorData {
  return 'error' in Object(value)
}

function normalizeErrorOnlyErrorData (
  data: ErrorOnlyErrorData,
  { statusCode }: ErrorDataOptions,
): ErrorData {
  return {
    ...data,
    statusCode,
    message: data.error,
  }
}

interface MessageAndErrorCodeErrorData {
  message: string
  errorCode: string
}

function isMessageAndErrorCodeErrorData (value: any): value is MessageAndErrorCodeErrorData {
  const o = Object(value)
  return 'message' in o
    && 'errorCode' in o
}

function normalizeMessageAndErrorCodeErrorData (
  data: MessageAndErrorCodeErrorData,
  { statusCode }: ErrorDataOptions,
): ErrorData {
  return {
    ...data,
    statusCode,
    error: data.message,
  }
}

type StringErrorData = string

function isStringErrorData (value: any): value is StringErrorData {
  return typeof value === 'string'
}

function normalizeStringErrorData (
  data: StringErrorData,
  { statusCode }: ErrorDataOptions,
): ErrorData {
  return {
    statusCode,
    error: data,
    message: data,
  }
}

/**
 * Error thrown when an API request unexpectedly produces no response.
 */
export class MissingResponseError extends Error {
  constructor (options: ErrorOptions) {
    super(
      `Encountered an error connecting to Checkly. Please check that `
      + `the internet connection is working.`
      + `\n\n`
      + `Details: ${options.cause}`,
      options,
    )
    this.name = 'MissingResponseError'
  }
}

/**
 * Error thrown when the configured proxy cannot be reached.
 */
export class ProxyConnectionError extends Error {
  constructor (proxyUrl: string, options: ErrorOptions) {
    super(
      `Could not connect to the proxy at ${proxyUrl}. `
      + `Check that the proxy is running and that the http_proxy/https_proxy/all_proxy `
      + `environment variables point to the correct address.`
      + `\n\n`
      + `Details: ${options.cause}`,
      options,
    )
    this.name = 'ProxyConnectionError'
  }
}

// Codes that indicate a connection to a host could not be established (refused,
// timed out, unreachable, or unresolvable). When a proxy is configured the
// connection is made to the proxy first, so these signal that the proxy itself
// could not be reached.
const CONNECTION_FAILURE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
])

// Walks an error's `cause` chain and any aggregated `errors` (e.g. happy-eyeballs
// AggregateError) collecting every `code` encountered.
function collectErrorCodes (err: unknown, codes = new Set<string>(), seen = new Set<unknown>()): Set<string> {
  if (!err || typeof err !== 'object' || seen.has(err)) {
    return codes
  }
  seen.add(err)
  const { code, cause, errors } = err as { code?: unknown, cause?: unknown, errors?: unknown }
  if (typeof code === 'string') {
    codes.add(code)
  }
  collectErrorCodes(cause, codes, seen)
  if (Array.isArray(errors)) {
    for (const nested of errors) {
      collectErrorCodes(nested, codes, seen)
    }
  }
  return codes
}

// Returns the proxy that the failed request was routed through, with any
// credentials stripped, or undefined when no proxy applied.
function redactedProxyForRequest (config: InternalAxiosRequestConfig | undefined): string | undefined {
  if (!config) {
    return undefined
  }
  let targetUrl: string
  try {
    targetUrl = new URL(config.url ?? '', config.baseURL || undefined).toString()
  } catch {
    if (!config.baseURL) {
      return undefined
    }
    targetUrl = config.baseURL
  }
  const proxyUrl = getProxyUrl(targetUrl)
  if (!proxyUrl) {
    return undefined
  }
  try {
    return new URL(proxyUrl).origin
  } catch {
    // Never surface a proxy URL we cannot parse — it may carry credentials.
    return undefined
  }
}

export function handleErrorResponse (err: Error): never {
  if (isAxiosError(err)) {
    if (!err.response) {
      const proxyUrl = redactedProxyForRequest(err.config)
      if (proxyUrl) {
        const codes = collectErrorCodes(err)
        if ([...codes].some(code => CONNECTION_FAILURE_CODES.has(code))) {
          throw new ProxyConnectionError(proxyUrl, { cause: err })
        }
      }
      throw new MissingResponseError({ cause: err })
    }

    const { status: statusCode, data } = err.response

    const errorData = parseErrorData(data, {
      statusCode,
    })

    if (errorData !== undefined) {
      if (statusCode === 400) {
        throw new ValidationError(errorData, { cause: err })
      }

      if (statusCode === 401) {
        throw new UnauthorizedError(errorData, { cause: err })
      }

      if (statusCode === 402) {
        throw new InadequateEntitlementsError(errorData, { cause: err })
      }

      if (statusCode === 403) {
        throw new ForbiddenError(errorData, { cause: err })
      }

      if (statusCode === 404) {
        throw new NotFoundError(errorData, { cause: err })
      }

      if (statusCode === 408) {
        throw new RequestTimeoutError(errorData, { cause: err })
      }

      if (statusCode === 409) {
        throw new ConflictError(errorData, { cause: err })
      }

      if (statusCode >= 500) {
        throw new ServerError(errorData, { cause: err })
      }

      throw new MiscellaneousError(errorData, { cause: err })
    }

    if (statusCode === 408) {
      throw new RequestTimeoutError({
        statusCode,
        error: 'Request Timeout',
        message: 'Encountered an error connecting to Checkly. '
          + 'This can be triggered by a slow internet connection or a network with high packet loss.',
      })
    }
  }

  throw err
}
