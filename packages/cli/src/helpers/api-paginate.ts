import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { parseTotalFromContentRange } from './content-range.js'

const MAX_PAGES = 500

export interface PaginateLogger {
  warn (message: string): void
}

export function paginateAll (
  apiClient: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  firstResponse: AxiosResponse,
  logger?: PaginateLogger,
): Promise<unknown> {
  const contentRange = firstResponse.headers['content-range']
  if (contentRange) {
    return paginateContentRange(apiClient, requestConfig, firstResponse, contentRange)
  }

  if (
    firstResponse.data
    && typeof firstResponse.data === 'object'
    && 'nextId' in firstResponse.data
  ) {
    const arrayField = findArrayField(firstResponse.data)
    if (arrayField) {
      return paginateCursor(apiClient, requestConfig, firstResponse, arrayField, logger)
    }
  }

  if (logger) {
    logger.warn('--paginate had no effect — response does not use a recognized pagination pattern.')
  } else {
    process.stderr.write('Warning: --paginate had no effect — response does not use a recognized pagination pattern.\n')
  }
  return Promise.resolve(firstResponse.data)
}

async function paginateContentRange (
  apiClient: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  firstResponse: AxiosResponse,
  contentRange: string,
): Promise<unknown[]> {
  const total = parseTotalFromContentRange(contentRange)
  if (total === null) return asArray(firstResponse.data)

  const firstData = asArray(firstResponse.data)
  const pageSize = firstData.length
  if (pageSize === 0 || total <= pageSize) return firstData

  const totalPages = Math.ceil(total / pageSize)
  const pages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      apiClient.request({
        ...requestConfig,
        params: { ...requestConfig.params, page: i + 2, limit: pageSize },
      }).then(r => {
        if (r.status >= 400) {
          throw new Error(`Pagination failed on page ${i + 2}: HTTP ${r.status} ${r.statusText}`)
        }
        return asArray(r.data)
      }),
    ),
  )

  return firstData.concat(...pages)
}

async function paginateCursor (
  apiClient: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  firstResponse: AxiosResponse,
  arrayField: string,
  logger?: PaginateLogger,
): Promise<unknown[]> {
  const allEntries = [...(firstResponse.data[arrayField] as unknown[])]
  let nextId: string | null = firstResponse.data.nextId
  let pageCount = 1

  while (nextId) {
    if (pageCount >= MAX_PAGES) {
      const message = `Pagination stopped after ${MAX_PAGES} pages — results may be incomplete.`
      if (logger) {
        logger.warn(message)
      } else {
        process.stderr.write(`Warning: ${message}\n`)
      }
      break
    }
    const response = await apiClient.request({
      ...requestConfig,
      params: { ...requestConfig.params, nextId },
    })
    if (response.status >= 400) {
      throw new Error(`Pagination failed: HTTP ${response.status} ${response.statusText}`)
    }
    const page = response.data
    if (Array.isArray(page[arrayField])) {
      allEntries.push(...(page[arrayField] as unknown[]))
    }
    nextId = page.nextId ?? null
    pageCount++
  }

  return allEntries
}

function findArrayField (data: Record<string, unknown>): string | null {
  for (const key of Object.keys(data)) {
    if (key !== 'nextId' && Array.isArray(data[key])) {
      return key
    }
  }
  return null
}

function asArray (data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data]
}
