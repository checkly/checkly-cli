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
    key: Args.string({
      name: 'arguments',
      required: true,
      description: 'Environment variable key.',
    }),
    value: Args.string({
      name: 'arguments',
      required: false,
      description: 'Environment variable value.',
    }),
  }

  async run (): Promise<void> {
    const { flags, args } = await this.parse(EnvAdd)
    const { locked } = flags

    const envVariableName = args.key
    let envValue = ''
    // check if env variable exists
    if (args.value) {
      envValue = args.value
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
