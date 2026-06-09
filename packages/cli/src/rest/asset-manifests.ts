import type { AxiosInstance } from 'axios'

export type AssetManifestEntryType = 'log' | 'trace' | 'video' | 'screenshot' | 'pcap' | 'report' | 'file'

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

  async getForCheckResult (checkId: string, checkResultId: string): Promise<AssetManifest> {
    const response = await this.api.get<AssetManifest>(`/v1/check-results/${checkId}/${checkResultId}/assets`)
    return response.data
  }

  async getForTestSessionResult (testSessionId: string, testSessionResultId: string): Promise<AssetManifest> {
    const response = await this.api.get<AssetManifest>(
      `/v1/test-sessions/${testSessionId}/results/${testSessionResultId}/assets`,
    )
    return response.data
  }
}

export default AssetManifests
