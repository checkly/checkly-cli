import * as api from '../../rest/api.js'
import { AuthCommand } from '../authCommand.js'
import { escapeValue } from '../../services/util.js'

export default class EnvLs extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
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
