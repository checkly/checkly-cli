import { Runtime } from '../runtimes/index.js'
import { RestResource } from './rest-resource.js'

class Runtimes extends RestResource {
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
