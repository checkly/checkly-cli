import prompts from 'prompts'
import * as api from '../../rest/api'
import { Flags, Args } from '@oclif/core'
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
    secret: Flags.boolean({
      char: 's',
      description: 'Indicate that the environment variable will be secret.',
      default: false,
      exclusive: ['locked'],
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
    const { locked, secret } = flags

    const envVariableName = args.key
    let envValue = ''
    // check if env variable exists
    if (args.value) {
      envValue = args.value
    } else {
      const response = await prompts({
        type: 'password',
        name: 'value',
        message: `What is the value of ${envVariableName}?`,
      })

      envValue = response.value
    }
    try {
      await api.environmentVariables.add(envVariableName, envValue, locked, secret)
      this.style.shortSuccess(secret
        ? `Secret environment variable "${envVariableName}" added.`
        : `Environment variable "${envVariableName}" added.`,
      )
    } catch (err: any) {
      this.style.longError(`Your environment variable could not be added.`, err)
      this.exit(1)
    }
  }
}
