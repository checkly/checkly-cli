import type { AxiosInstance } from 'axios'

// eslint-disable-next-line no-restricted-syntax
enum AssetType {
  LOG = 'log',
  CHECK_RUN_DATA = 'check-run-data',
  SCREENSHOT = 'screenshot',
}

export default class Assets {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getLogs (region: string, key: string): Promise<Array<{ time: number, msg: string, level: string }>> {
    return this.getAssets(AssetType.LOG, region, key)
  }

  getCheckRunData (region: string, key: string): Promise<any> {
    return this.getAssets(AssetType.CHECK_RUN_DATA, region, key)
  }

  private async getAssets (assetType: AssetType, region: string, key: string): Promise<any> {
    const response = await this.api.get(`/next/assets/${assetType}/${region}/${encodeURIComponent(key)}`)
    return response.data
  }

  async getAssetsLink (region: string, key: string): Promise<any> {
    const response = await this.api.get<string>(
      `/next/assets/${AssetType.CHECK_RUN_DATA}/${region}/${encodeURIComponent(key)}/redirect?link=true`)
    return response.data
  }
}
