import type { AxiosInstance } from 'axios'

class ChecklyStorage {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getSignedUrls (keys: string[]) {
    const data = keys.map(key => ({ key }))
    return this.api.post<Array<{ signedUrl: string, key: string }>>('/next/checkly-storage/signed-urls', data)
  }

  getSignedUploadUrls (paths: string[]) {
    const data = paths.map(path => ({ path }))
    return this.api.post<Array<{ signedUrl: string, key: string, path: string }>>('/next/checkly-storage/signed-upload-urls', data)
  }
}

export default ChecklyStorage
