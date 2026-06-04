import { Logger } from '../core'

export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
}

export const defaultRetryOptions: RetryOptions = {
  retries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
}

export function backoffDelay (attempt: number, options: RetryOptions = defaultRetryOptions): number {
  const delay = options.baseDelayMs * 2 ** attempt
  return Math.min(delay, options.maxDelayMs)
}

export async function withRetry<T> (
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = defaultRetryOptions,
  logger?: Logger,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      logger?.warn(`attempt ${attempt} failed: ${String(error)}`)
      await new Promise(resolve => setTimeout(resolve, backoffDelay(attempt, options)))
    }
  }
  throw lastError
}
