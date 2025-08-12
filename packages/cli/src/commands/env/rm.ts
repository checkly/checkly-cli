import prompts from 'prompts'
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

    try {
      await api.environmentVariables.delete(envVariableKey)
      this.style.shortSuccess(`Environment variable "${envVariableKey}" deleted.`)
    } catch (err: any) {
      this.style.longError(`Your environment variable could not be removed.`, err)
      this.exit(1)
    }
  }
}
