import * as api from '../../rest/api'
import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvRm extends AuthCommand {
  static hidden = false
  static description = 'Remove environment variable via checkly env rm <key> --force'

  static args = {
    fileArgs: Args.string({
      name: 'subcommands',
      required: false,
      description: 'Subcommand env',
      default: 'ls',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { argv } = await this.parse(EnvRm)
    const subcommands = argv as string[]

    if (subcommands.length > 4) {
      this.error('Too many arguments. Please use "checkly env ls" or "checkly env pull filename"')
      return
    }

    // rm env variable
    if (!subcommands[1]) {
      this.error('Please provide a variable key to delete')
      return
    }
    const envVariableKey = subcommands[1]
    // check if env variable exists
    const { data: environmentVariables } = await api.environmentVariables.getAll()
    const envVariable = environmentVariables.find(({ key }) => key === envVariableKey)
    if (!envVariable) {
      this.error(`Environment variable ${envVariableKey} not found.`)
      return
    }
    await api.environmentVariables.delete(subcommands[1])
    this.log(`Environment variable ${subcommands[1]} deleted.`)
  }
}
