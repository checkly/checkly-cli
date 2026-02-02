import type { AxiosInstance } from 'axios'

import { Runtime } from '../runtimes'

class Runtimes {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAll (): Promise<Runtime[]> {
    const resp = await this.api.get<Array<Runtime>>('/v1/runtimes')
    return resp.data
  }

  async get (runtimeId: string): Promise<Runtime> {
    const resp = await this.api.get<Runtime>(`/v1/runtimes/${runtimeId}`)
    return resp.data
  }
}

export default Runtimes
