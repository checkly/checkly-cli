import prompts from 'prompts'
import * as api from '../../rest/api'
import { Flags, Args } from '@oclif/core'
import { AuthCommand } from '../authCommand'

export default class EnvUpdate extends AuthCommand {
  static hidden = false
  static idempotent = true
  static description = 'Update environment variable via "checkly env update <key> <value>".'

  static flags = {
    locked: Flags.boolean({
      char: 'l',
      description: 'Indicate if environment variable is locked.',
      default: false,
    }),
    secret: Flags.boolean({
      char: 's',
      description: 'Indicate if environment variable is secret.',
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
    const { flags, args } = await this.parse(EnvUpdate)
    const { locked, secret } = flags

    const envVariableName = args.key
    let envValue = ''
    // check if env variable arg exists
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
      await api.environmentVariables.update(envVariableName, envValue, locked, secret)
      this.style.shortSuccess(secret
        ? `Secret environment variable "${envVariableName}" updated.`
        : `Environment variable "${envVariableName}" updated.`,
      )
    } catch (err: any) {
      this.style.longError(`Your environment variable could not be updated.`, err)
      this.exit(1)
    }
  }
}
