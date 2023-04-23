import * as api from '../../rest/api'
import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvRm extends AuthCommand {
  static hidden = false
  static description = 'Remove environment variable via checkly env rm <key>.'

  static args = {
    fileArgs: Args.string({
      name: 'key',
      required: true,
      description: 'Environment variable key to remove.',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { argv } = await this.parse(EnvRm)
    const args = argv as string[]

    if (args.length > 1) {
      throw new Error('Too many arguments. Please use "checkly env rm <key>".')
    }

    // rm env variable
    if (!args[0]) {
      throw new Error('Please provide a variable key to delete')
    }
    const envVariableKey = args[0]
    // try to delete env variable catch 404 if env variable does not exist
    try {
      await api.environmentVariables.delete(envVariableKey)
      this.log(`Environment variable ${envVariableKey} deleted.`)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new Error(`Environment variable ${envVariableKey} does not exist.`)
      } else {
        throw new Error(`Failed to delete environment variable. ${err.message}`)
      }
    }
  }
}
