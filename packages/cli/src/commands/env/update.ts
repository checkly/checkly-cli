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
    const { flags, args } = await this.parse(EnvUpdate)
    const { locked } = flags

    const envVariableName = args.key
    let envValue = ''
    // check if env variable arg exists
    if (args.value) {
      envValue = args.value
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
