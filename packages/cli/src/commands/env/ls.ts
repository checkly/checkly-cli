import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import { escapeValue } from '../../services/util'

export default class EnvLs extends AuthCommand {
  static hidden = false
  static description = 'List all Checkly environment variables via "checkly env ls".'

  async run (): Promise<void> {
    const { data: environmentVariables } = await api.environmentVariables.getAll()

    if (environmentVariables.length === 0) {
      this.log('No environment variables found.')
      return
    }
    this.log('Environment variables:')
    const env = environmentVariables.map(({ key, value }) => `${key}=${escapeValue(value)}`).join('\n')
    this.log(`${env}`)
  }
}
