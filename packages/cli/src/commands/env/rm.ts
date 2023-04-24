import { prompt } from 'inquirer'
import * as api from '../../rest/api'
import { Flags, Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvRm extends AuthCommand {
  static hidden = false
  static description = 'Remove environment variable via "checkly env rm <key>".'

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Force to skip the confirmation prompt.',
      default: false,
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'key',
      required: true,
      description: 'Environment variable key to remove.',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(EnvRm)
    const { force } = flags
    const args = argv as string[]

    if (args.length > 1) {
      throw new Error('Too many arguments. Please use "checkly env rm <key>".')
    }

    // rm env variable
    if (!args[0]) {
      throw new Error('Please provide a variable key to delete')
    }

    if (!force) {
      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message: `Are you sure you want to delete environment variable ${args[0]}?`,
      }])
      if (!confirm) {
        this.log('Cancelled. No changes made.')
        return
      }
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
