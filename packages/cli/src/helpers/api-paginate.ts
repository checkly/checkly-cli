import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

function parseTotalFromContentRange (header: string | undefined): number | null {
  if (!header) return null
  const match = header.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

export function paginateAll (
  apiClient: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  firstResponse: AxiosResponse,
): Promise<unknown> {
  const contentRange = firstResponse.headers['content-range']
  if (contentRange) {
    return paginateContentRange(apiClient, requestConfig, firstResponse, contentRange)
  }

  if (
    firstResponse.data
    && typeof firstResponse.data === 'object'
    && 'nextId' in firstResponse.data
    && 'entries' in firstResponse.data
  ) {
    return paginateCursor(apiClient, requestConfig, firstResponse)
  }

  process.stderr.write('Warning: --paginate had no effect — response does not use a recognized pagination pattern.\n')
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
      }).then(r => asArray(r.data)),
    ),
  )

  return firstData.concat(...pages)
}

async function paginateCursor (
  apiClient: AxiosInstance,
  requestConfig: AxiosRequestConfig,
  firstResponse: AxiosResponse,
): Promise<unknown[]> {
  const allEntries = [...(firstResponse.data.entries as unknown[])]
  let nextId: string | null = firstResponse.data.nextId

  while (nextId) {
    const response = await apiClient.request({
      ...requestConfig,
      params: { ...requestConfig.params, nextId },
    })
    const page = response.data
    if (page.entries) {
      allEntries.push(...(page.entries as unknown[]))
    }
    nextId = page.nextId ?? null
  }

  return allEntries
}

function asArray (data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data]
}
