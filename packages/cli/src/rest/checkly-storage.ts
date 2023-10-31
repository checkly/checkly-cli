import type { AxiosInstance } from 'axios'

class ChecklyStorage {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getPresignedUrls (keys: string[]) {
    const data = keys.map(key => ({ key }))
    return this.api.post<Array<{ signedUrl: string, key: string }>>('/next/checkly-storage/signed-urls', data)
  }
}

export default ChecklyStorage
