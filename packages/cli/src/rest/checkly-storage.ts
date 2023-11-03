import type { AxiosInstance } from 'axios'
import type { Readable } from 'node:stream'

class ChecklyStorage {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  upload (stream: Readable) {
    return this.api.post<{ key: string }>(
      '/next/checkly-storage/upload',
      stream,
      { headers: { 'Content-Type': 'application/octet-stream' } },
    )
  }

  download (key: string) {
    return this.api.post('/next/checkly-storage/download', { key }, { responseType: 'stream' })
  }
}

export default ChecklyStorage
