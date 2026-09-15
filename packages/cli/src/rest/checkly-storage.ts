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

  /**
   * @param sha256 Lowercase hex SHA-256 of the archive. Stored as object
   * metadata, so an uploaded bundle can be matched to the hash the deploy
   * payload reports for it.
   */
  uploadCodeBundle (stream: Readable, size: number, sha256?: string) {
    return this.api.post<{ key: string }>(
      '/next/checkly-storage/upload-code-bundle',
      stream,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'content-length': size,
          ...sha256 ? { 'x-bundle-checksum-sha256': sha256 } : {},
        },
      },
    )
  }

  download (key: string) {
    return this.api.post('/next/checkly-storage/download', { key }, { responseType: 'stream' })
  }
}

export default ChecklyStorage
