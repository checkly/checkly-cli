import type { AxiosInstance } from 'axios'

export default class Checks {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (check: any) {
    const type = check.checkType.toLowerCase()
    return this.api.post(`/next/checks/run/${type}`, check)
  }
}
