import type { AxiosInstance } from 'axios'

export interface EnvironmentVariable {
  key: string
  value: string
  locked: boolean
  secret?: boolean
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

  add (environmentVariableKey: string, environmentVariableValue: string, locked = false, secret = false) {
    return this.api.post('/v1/variables', { key: environmentVariableKey, value: environmentVariableValue, locked, secret })
  }

  get (environmentVariableKey: string) {
    return this.api.get<EnvironmentVariable>(`/v1/variables/${environmentVariableKey}`)
  }

  // update environment variable with default locked value false
  update (environmentVariableKey: string, environmentVariableValue: string, locked = false, secret = false) {
    return this.api.put(`/v1/variables/${environmentVariableKey}`, { value: environmentVariableValue, locked, secret })
  }
}

export default EnvironmentVariables
