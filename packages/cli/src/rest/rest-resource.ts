import type { AxiosInstance } from 'axios'

/**
 * A group of calls to one area of the Checkly API.
 *
 * The axios instance is looked up through a provider on every call rather
 * than passed in, so a resource object can be created when its module loads
 * while the client, whose creation reads the configured credentials and API
 * host, is only created when a request is made.
 */
export abstract class RestResource {
  readonly #getApi: () => AxiosInstance

  constructor (getApi: () => AxiosInstance) {
    this.#getApi = getApi
  }

  protected get api (): AxiosInstance {
    return this.#getApi()
  }
}
