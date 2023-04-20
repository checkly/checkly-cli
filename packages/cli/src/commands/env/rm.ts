import * as api from '../../rest/api'
import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvRm extends AuthCommand {
  static hidden = false
  static description = 'Remove environment variable via checkly env rm <key>'

  static args = {
    fileArgs: Args.string({
      name: 'key',
      required: true,
      description: 'key',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { argv } = await this.parse(EnvRm)
    const args = argv as string[]

    if (args.length > 1) {
      throw new Error('Too many arguments. Please use "checkly env rm <key>"')
    }

    // rm env variable
    if (!args[0]) {
      throw new Error('Please provide a variable key to delete')
    }
    const envVariableKey = args[0]
    // check if env variable exists
    const { data: environmentVariables } = await api.environmentVariables.getAll()
    const envVariable = environmentVariables.find(({ key }) => key === envVariableKey)
    if (!envVariable) {
      throw new Error(`Environment variable ${envVariableKey} not found.`)
    }
    await api.environmentVariables.delete(args[0])
    this.log(`Environment variable ${args[0]} deleted.`)
  }
}
