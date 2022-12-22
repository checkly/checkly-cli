import type { AxiosInstance } from 'axios'

export default class Sockets {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getPresignedUrl (): Promise<string> {
    const response = await this.api.get('/next/sockets/signed-url')
    return response.data.url
  }
}
