import type { AxiosInstance } from 'axios'

export type AssetManifestEntryType = 'log' | 'trace' | 'video' | 'screenshot' | 'pcap' | 'report' | 'file'

export interface AssetManifestFilters {
  type?: AssetManifestEntryType
  name?: string
}

export interface AssetManifestArchiveEntry {
  entryName: string
}

export interface AssetManifestEntry {
  type: AssetManifestEntryType
  name: string
  url: string
  contentType?: string
  source: string
  archive?: AssetManifestArchiveEntry
}

export interface AssetManifest {
  assets: AssetManifestEntry[]
  truncated?: boolean
  entriesReturned?: number
  entriesTotal?: number
}

class AssetManifests {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getForCheckResult (
    checkId: string,
    checkResultId: string,
    filters?: AssetManifestFilters,
  ): Promise<AssetManifest> {
    const url = `/v1/check-results/${checkId}/${checkResultId}/assets`
    const config = requestConfig(filters)
    const response = config
      ? await this.api.get<AssetManifest>(url, config)
      : await this.api.get<AssetManifest>(url)
    return response.data
  }

  async getForTestSessionResult (
    testSessionId: string,
    testSessionResultId: string,
    filters?: AssetManifestFilters,
  ): Promise<AssetManifest> {
    const url = `/v1/test-sessions/${testSessionId}/results/${testSessionResultId}/assets`
    const config = requestConfig(filters)
    const response = config
      ? await this.api.get<AssetManifest>(url, config)
      : await this.api.get<AssetManifest>(url)
    return response.data
  }
}

function requestConfig (filters?: AssetManifestFilters) {
  if (!filters || Object.keys(filters).length === 0) return undefined
  return { params: filters }
}

export default AssetManifests
