import { Logger } from '../core'
import { err, ok, Result } from '../core/result'
import { RetryOptions, withRetry } from './retry'

export interface HttpResponse<T> {
  status: number
  body: T
}

export class HttpClient {
  private readonly logger: Logger

  constructor (
    private readonly baseUrl: string,
    logger?: Logger,
  ) {
    this.logger = (logger ?? new Logger('http')).child('client')
  }

  async getJson<T> (path: string, retry?: RetryOptions): Promise<Result<HttpResponse<T>>> {
    try {
      const response = await withRetry(async () => {
        const res = await fetch(`${this.baseUrl}${path}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res
      }, retry, this.logger)
      const body = (await response.json()) as T
      return ok({ status: response.status, body })
    } catch (error) {
      this.logger.error(`getJson ${path} failed: ${String(error)}`)
      return err(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
