import * as api from '../../rest/api'
import { Flags, Args, ux } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvUpdate extends AuthCommand {
  static hidden = false
  static description = 'Update environment variable via "checkly env update <key> <value>".'

  static flags = {
    locked: Flags.boolean({
      char: 'l',
      description: 'Indicate if environment variable is locked.',
      default: false,
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'arguments',
      required: true,
      description: 'Arguments to update environment variable <key> <value>.',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(EnvUpdate)
    const { locked } = flags
    const subcommands = argv as string[]

    if (subcommands.length > 2) {
      throw new Error('Too many arguments. Please use "checkly env update <key> <value>".')
    }

    if (!subcommands[0]) {
      throw new Error('Please provide a variable key to update.')
    }
    const envVariableName = subcommands[0]
    let envValue = ''
    // check if env variable arg exists
    if (subcommands[1]) {
      envValue = subcommands[1]
    } else {
      envValue = await ux.prompt(`What is the value of ${envVariableName}?`, { type: 'mask' })
    }
    try {
      await api.environmentVariables.update(envVariableName, envValue, locked)
      this.log(`Environment variable ${envVariableName} updated.`)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new Error(`Environment variable ${envVariableName} not found.`)
      }
      throw err
    }
  }
}
