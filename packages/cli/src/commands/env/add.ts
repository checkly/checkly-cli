import * as api from '../../rest/api'
import { Flags, Args, ux } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvAdd extends AuthCommand {
  static hidden = false
  static description = 'Add environment variable via "checkly env add <key> <value>".'

  static flags = {
    locked: Flags.boolean({
      char: 'l',
      description: 'Indicate that the environment variable will be locked.',
      default: false,
    }),
  }

  static args = {
    fileArgs: Args.string({
      name: 'arguments',
      required: true,
      description: 'Arguments to add environment variable <key> <value>.',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(EnvAdd)
    const { locked } = flags
    const subcommands = argv as string[]

    if (subcommands.length > 2) {
      throw new Error('Too many arguments. Please use "checkly env add <key> <value>".')
    }

    // add env variable
    if (!subcommands[0]) {
      throw new Error('Please provide a variable key to add.')
    }
    const envVariableName = subcommands[0]
    let envValue = ''
    // check if env variable exists
    if (subcommands[1]) {
      envValue = subcommands[1]
    } else {
      envValue = await ux.prompt(`What is the value of ${envVariableName}?`, { type: 'mask' })
    }
    try {
      await api.environmentVariables.add(envVariableName, envValue, locked)
      this.log(`Environment variable ${envVariableName} added.`)
    } catch (err: any) {
      if (err?.response?.status === 409) {
        throw new Error(`Environment variable ${envVariableName} already exists.`)
      }
      throw err
    }
  }
}
