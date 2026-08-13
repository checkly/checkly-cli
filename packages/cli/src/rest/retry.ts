import { setTimeout as delay } from 'node:timers/promises'
import { AxiosError, AxiosInstance, AxiosResponse, GenericAbortSignal, isAxiosError } from 'axios'
import Debug from 'debug'

const debug = Debug('checkly:cli:rest:retry')

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * Opts a mutating request (POST/PUT/PATCH/DELETE) into transient-error
     * retries. Only set this on endpoints known to be idempotent: a mutation
     * that received a gateway error may still have been applied upstream, and
     * a retry would apply it again.
     *
     * Only honored by the shared REST instance created in api.ts — bare
     * axios calls (e.g. presigned-URL asset downloads) register no retry
     * interceptor, so the flag is inert there.
     *
     * Do not combine with a custom transformRequest: a retry replays the
     * already-transformed body through the transform again, and reuses the
     * previous attempt's Content-Length header, so a non-idempotent or
     * length-changing transform silently corrupts or truncates the body on
     * the wire. (The default JSON transform is idempotent, and
     * stream-producing transforms are blocked by the stream-body guard.)
     */
    checklyRetry?: boolean
    /** Internal: attempts already made for this logical request. */
    checklyRetryAttempt?: number
  }
}

export interface RetryOptions {
  /** Total attempts including the initial request. */
  attempts?: number
  /** Base delay for exponential backoff, in milliseconds. */
  baseDelayMs?: number
  /** Cap for a single delay (backoff or Retry-After), in milliseconds. */
  maxDelayMs?: number
  /**
   * Overridable in tests to avoid real sleeps. The abort signal fires when
   * the wait is abandoned early; a sleep should cancel its timer then.
   */
  sleep?: (ms: number, abortSignal?: AbortSignal) => Promise<void>
  /** Overridable in tests to make jitter deterministic. */
  random?: () => number
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 2000

// The transient gateway class only. 408 is deliberately excluded: the API
// uses it to end long-poll requests, and the polling callers own that retry
// cadence. Plain 500 is also a conscious exclusion, even though brief API
// degradations have been observed to produce the occasional 500 alongside
// 502s: a 500 is just as often a deterministic application failure, and
// retrying those multiplies load and latency for no benefit.
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])

// Connection-level failures where no response arrived. Safe to retry for
// idempotent requests even if the request reached the server.
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ERR_NETWORK',
  'EPIPE',
])

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options'])

// The timer must stay ref'd while the wait is live: the caller is awaiting
// the retried request, and an unref'd timer would let the event loop drain
// mid-backoff, silently exiting the process with the request unresolved.
// When the wait is abandoned early (request aborted), the timer is cancelled
// through the signal so it cannot keep the process alive for the remainder
// of the delay either.
function defaultSleep (ms: number, abortSignal?: AbortSignal): Promise<void> {
  return delay(ms, undefined, { signal: abortSignal }).catch((err: unknown) => {
    // A cancelled backoff sleep is not an error; the caller re-checks the
    // request's own signal after waking up.
    if ((err as Error)?.name !== 'AbortError') {
      throw err
    }
  })
}

// Resolves when the sleep finishes or the signal aborts, whichever comes
// first, so an aborted caller is not kept waiting out the backoff delay.
async function sleepUnlessAborted (
  sleep: (ms: number, abortSignal?: AbortSignal) => Promise<void>,
  ms: number,
  signal: GenericAbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) {
    return
  }

  // A real AbortController of our own (config.signal is only a
  // GenericAbortSignal, which node's timers reject): aborted once the race
  // settles, so a lost sleep timer cannot linger and keep the process alive.
  const sleepAbort = new AbortController()
  let onAbort: (() => void) | undefined
  try {
    await Promise.race([
      sleep(ms, sleepAbort.signal),
      new Promise<void>(resolve => {
        onAbort = resolve
        signal?.addEventListener?.('abort', onAbort)
      }),
    ])
  } finally {
    sleepAbort.abort()
    if (onAbort !== undefined) {
      signal?.removeEventListener?.('abort', onAbort)
    }
  }
}

/**
 * Parses a Retry-After header value (delay-seconds or HTTP-date) into a
 * delay in milliseconds, or undefined if the value is absent or malformed.
 */
export function parseRetryAfter (value: unknown): number | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined
  }

  const seconds = Number(value)
  if (!Number.isNaN(seconds)) {
    return seconds >= 0 ? seconds * 1000 : undefined
  }

  const date = Date.parse(value)
  if (Number.isNaN(date)) {
    return undefined
  }

  return Math.max(0, date - Date.now())
}

function isStream (value: any): boolean {
  return value !== null && typeof value === 'object' && typeof value.pipe === 'function'
}

/**
 * Whether the request itself may be replayed: idempotent method (or explicit
 * opt-in), not aborted, and no single-use stream involved on either side.
 */
function isRetryableRequest (config: NonNullable<AxiosError['config']>): boolean {
  if (config.signal?.aborted) {
    return false
  }

  // Streamed responses (e.g. the deployment progress SSE stream) may have
  // been partially consumed by the caller and cannot be transparently
  // reissued. Streamed request bodies (e.g. gzipped payloads and file
  // uploads) are single-use and already drained by the failed attempt. If
  // upload resilience is wanted later, it belongs at the call site, which
  // can re-create the stream (e.g. re-open the file) before retrying.
  if (config.responseType === 'stream' || isStream(config.data)) {
    return false
  }

  const method = (config.method ?? 'get').toLowerCase()
  return IDEMPOTENT_METHODS.has(method) || config.checklyRetry === true
}

/**
 * Whether the failure looks transient: a retryable gateway status, or a
 * connection-level error with no response at all.
 */
function isRetryableFailure (error: AxiosError): boolean {
  if (error.response !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.response.status)
  }

  return error.code !== undefined && RETRYABLE_ERROR_CODES.has(error.code)
}

/**
 * Creates an axios response rejection handler that retries transient upstream
 * failures with bounded, jittered exponential backoff. Register it before the
 * error-mapping interceptor so it sees the raw AxiosError; a successful retry
 * resolves into the next interceptor's fulfilled handler, and an exhausted
 * one rethrows into its rejection handler.
 */
export function createRetryInterceptor (api: AxiosInstance, options?: RetryOptions) {
  const {
    attempts = DEFAULT_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    sleep = defaultSleep,
    random = Math.random,
  } = options ?? {}

  return async function retryInterceptor (error: unknown): Promise<AxiosResponse> {
    if (!isAxiosError(error) || error.config === undefined) {
      throw error
    }

    const { config } = error

    if (!isRetryableRequest(config) || !isRetryableFailure(error)) {
      throw error
    }

    const attempt = config.checklyRetryAttempt ?? 1
    if (attempt >= attempts) {
      throw error
    }

    const status = error.response?.status
    const retryAfterMs = parseRetryAfter(error.response?.headers?.['retry-after'])

    let delayMs: number
    if (retryAfterMs !== undefined && retryAfterMs <= maxDelayMs) {
      delayMs = retryAfterMs
    } else if (status === 429 && retryAfterMs !== undefined) {
      // The server asked for a longer wait than our delay budget allows.
      // Retrying earlier than requested would likely just get throttled
      // again, so give up instead.
      throw error
    } else {
      // Full jitter: a uniformly random delay up to the exponential bound
      // spreads out concurrent clients hitting the same degraded gateway.
      delayMs = Math.round(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)))
    }

    debug(
      'Retrying %s %s after %s (attempt %d of %d, delay %dms)',
      (config.method ?? 'get').toUpperCase(),
      config.url,
      status ?? error.code,
      attempt + 1,
      attempts,
      delayMs,
    )

    await sleepUnlessAborted(sleep, delayMs, config.signal)

    if (config.signal?.aborted) {
      throw error
    }

    config.checklyRetryAttempt = attempt + 1
    return api.request(config)
  }
}
