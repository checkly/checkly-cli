import type { AxiosInstance } from 'axios'

// eslint-disable-next-line no-restricted-syntax
enum AssetType {
  LOG = 'log',
  CHECK_RUN_DATA = 'check-run-data',
  SCREENSHOT = 'screenshot',
}

/**
 * Mainly used by node based runners for all kind
 * of check types and artifacts.
 */
type CheckResultAssetsV1 = {
  region: string
  checkRunDataPath: string
  mtrPath?: string
  logPath?: string
  tcpDumpPath?: string
  snapshots?: string
  imagePaths?: string[]
  navigationTracePath?: string
  playwrightTestTraceFiles?: string[]
  playwrightTestVideoFiles?: string[]
  playwrightTestJsonReportPath?: string
}

export function isCheckResultAssetsV1 (assets: unknown): assets is CheckResultAssetsV1 {
  return typeof assets === 'object'
    && assets !== null
    && 'version' in assets === false
}

/**
 * Range based offsets for assets stored in V2 zip files.
 */
export type CheckResultAssetsV2Entries = {
  start: number
  end: number
  name: string
}

/**
 * Used by runner-ng for storing all assets in a single zip file.
 */
export type CheckResultAssetsV2 = {
  version: 2
  region: string
  key: string
  url: string
  entries: CheckResultAssetsV2Entries[]
}

export function isCheckResultAssetsV2 (assets: unknown): assets is CheckResultAssetsV2 {
  return typeof assets === 'object'
    && assets !== null
    && 'version' in assets
    && assets.version === 2
}

/**
 * Used mainly by Go-runner for storing all assets in ClickHouse.
 */
export type CheckResultAssetsV3 = {
  version: 3
  clickHouseId: string
  region: string
  tcpDumpPath?: string
  logPath?: string
}

export function isCheckResultAssetsV3 (assets: unknown): assets is CheckResultAssetsV3 {
  return typeof assets === 'object'
    && assets !== null
    && 'version' in assets
    && assets.version === 3
}

export type CheckResultAssets =
  | CheckResultAssetsV1
  | CheckResultAssetsV2
  | CheckResultAssetsV3

export default class Assets {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getLogs (asset: CheckResultAssets): Promise<Array<{ time: number, msg: string, level: string }>> {
    return this.getAssets(AssetType.LOG, asset)
  }

  getCheckRunData (asset: CheckResultAssets): Promise<any> {
    return this.getAssets(AssetType.CHECK_RUN_DATA, asset)
  }

  private async getAssets (assetType: AssetType, asset: CheckResultAssets): Promise<any> {
    const region: string = asset.region
    let key: string | undefined

    switch (assetType) {
      case AssetType.LOG: {
        if (isCheckResultAssetsV1(asset) && asset.logPath) {
          key = asset.logPath
        } else if (isCheckResultAssetsV3(asset) && asset.logPath) {
          key = asset.clickHouseId
        }
        break
      }
      case AssetType.CHECK_RUN_DATA: {
        if (isCheckResultAssetsV1(asset) && asset.checkRunDataPath) {
          key = asset.checkRunDataPath
        }
        break
      }
    }

    if (!key) {
      return
    }

    const response = await this.api.get(`/next/assets/${assetType}/${region}/${encodeURIComponent(key)}`)
    return response.data
  }

  async getAssetsLink (region: string, key: string): Promise<any> {
    const response = await this.api.get<string>(
      `/next/assets/${AssetType.CHECK_RUN_DATA}/${region}/${encodeURIComponent(key)}/redirect?link=true`)
    return response.data
  }
}
