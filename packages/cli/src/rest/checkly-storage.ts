import type { AxiosInstance, AxiosProgressEvent } from 'axios'
import type { Readable } from 'node:stream'

type UploadOptions = {
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
}

type DownloadOptions = {
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
}

class ChecklyStorage {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  upload (stream: Readable, options?: UploadOptions) {
    return this.api.post<{ key: string }>(
      '/next/checkly-storage/upload',
      stream,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
        onUploadProgress: options?.onUploadProgress,
      },
    )
  }

  download (key: string, options?: DownloadOptions) {
    return this.api.post('/next/checkly-storage/download', { key }, {
      responseType: 'stream',
      onDownloadProgress: options?.onDownloadProgress,
    })
  }
}

export default ChecklyStorage
