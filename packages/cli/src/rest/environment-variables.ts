import type { AxiosInstance } from 'axios'

export interface EnvironmentVariable {
  key: string
  value: string
  locked: boolean
}

class EnvironmentVariables {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<EnvironmentVariable>>('/v1/variables')
  }

  delete (environmentVariableKey: string) {
    return this.api.delete(`/v1/variables/${environmentVariableKey}`)
  }

  add (environmentVariableKey: string, environmentVariableValue: string, locked: boolean) {
    return this.api.post('/v1/variables', { key: environmentVariableKey, value: environmentVariableValue, locked })
  }

  get (environmentVariableKey: string) {
    return this.api.get<EnvironmentVariable>(`/v1/variables/${environmentVariableKey}`)
  }
}

export default EnvironmentVariables
