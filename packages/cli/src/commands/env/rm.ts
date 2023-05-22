import * as prompts from 'prompts'
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
    key: Args.string({
      name: 'key',
      required: true,
      description: 'Environment variable key to remove.',
    }),
  }

  async run (): Promise<void> {
    const { flags, args } = await this.parse(EnvRm)
    const { force } = flags
    const envVariableKey = args.key

    if (!force) {
      const { confirm } = await prompts({
        name: 'confirm',
        type: 'confirm',
        message: `Are you sure you want to delete environment variable ${envVariableKey}?`,
      })
      if (!confirm) {
        this.log('Cancelled. No changes made.')
        return
      }
    }

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
