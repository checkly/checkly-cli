import { type AxiosInstance } from 'axios'
import { ConflictError, NotFoundError } from './errors'

export interface EnvironmentVariable {
  key: string
  value: string
  locked: boolean
  secret?: boolean
}

/**
 * Error thrown when the requested environment variable does not exist.
 */
export class EnvironmentVariableNotFoundError extends Error {
  environmentVariable: string

  constructor (environmentVariable: string, options?: ErrorOptions) {
    super(`Environment variable "${environmentVariable}" does not exist.`, options)
    this.name = 'EnvironmentVariableNotFoundError'
    this.environmentVariable = environmentVariable
  }
}

/**
 * Error thrown when the requested environment variable already exists.
 */
export class EnvironmentVariableAlreadyExistsError extends Error {
  environmentVariable: string

  constructor (environmentVariable: string, options?: ErrorOptions) {
    super(`Environment variable "${environmentVariable}" already exists.`, options)
    this.name = 'EnvironmentVariableAlreadyExistsError'
    this.environmentVariable = environmentVariable
  }
}

class EnvironmentVariables {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<EnvironmentVariable>>('/v1/variables')
  }

  /**
   * @throws {EnvironmentVariableNotFoundError} If the environment variable does not exist.
   */
  async delete (environmentVariableKey: string) {
    try {
      return await this.api.delete(`/v1/variables/${environmentVariableKey}`)
    } catch (err: any) {
      if (err instanceof NotFoundError) {
        throw new EnvironmentVariableNotFoundError(environmentVariableKey)
      }

      throw err
    }
  }

  /**
   * @throws {EnvironmentVariableAlreadyExistsError} If the environment variable already exists.
   */
  async add (environmentVariableKey: string, environmentVariableValue: string, locked = false, secret = false) {
    try {
      return await this.api.post('/v1/variables', { key: environmentVariableKey, value: environmentVariableValue, locked, secret })
    } catch (err: any) {
      if (err instanceof ConflictError) {
        throw new EnvironmentVariableAlreadyExistsError(environmentVariableKey)
      }

      throw err
    }
  }

  /**
   * @throws {EnvironmentVariableNotFoundError} If the environment variable does not exist.
   */
  async get (environmentVariableKey: string) {
    try {
      return await this.api.get<EnvironmentVariable>(`/v1/variables/${environmentVariableKey}`)
    } catch (err: any) {
      if (err instanceof NotFoundError) {
        throw new EnvironmentVariableNotFoundError(environmentVariableKey)
      }

      throw err
    }
  }

  /**
   * @throws {EnvironmentVariableNotFoundError} If the environment variable does not exist.
  */
  // update environment variable with default locked value false
  async update (environmentVariableKey: string, environmentVariableValue: string, locked = false, secret = false) {
    try {
      return await this.api.put(`/v1/variables/${environmentVariableKey}`, { value: environmentVariableValue, locked, secret })
    } catch (err: any) {
      if (err instanceof NotFoundError) {
        throw new EnvironmentVariableNotFoundError(environmentVariableKey)
      }

      throw err
    }
  }
}

export default EnvironmentVariables
