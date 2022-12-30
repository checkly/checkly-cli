import type { AxiosInstance } from 'axios'

enum AssetType {
  LOG = 'log',
  CHECK_RUN_DATA = 'check-run-data',
  SCREENSHOT = 'screenshot',
}

export default class Assets {
  readonly AssetType = AssetType
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAssets (assetType: AssetType, region: string, key: string): Promise<string> {
    const response = await this.api.get(`/next/assets/${assetType}/${region}/${encodeURIComponent(key)}`)
    return response.data
  }
}
