import prompts from 'prompts'
import { Flags } from '@oclif/core'
import config from '../services/config.js'
import { BaseCommand } from './baseCommand.js'
import commonMessages from '../messages/common-messages.js'

export default class Logout extends BaseCommand {
  static hidden = false
  static idempotent = true
  static description = 'Log out and clear any local credentials.'
  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: commonMessages.forceMode,
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Logout)
    const { force } = flags
    const accountName = config.data.get('accountName')

    if (!force) {
      const message = `You are about to clear your local session ${accountName
        ? ' of "' + accountName + '"'
        : ''}, do you want to continue?`

      const { confirm } = await prompts({
        name: 'confirm',
        type: 'confirm',
        message,
      })

      if (!confirm) {
        this.exit(0)
      }
    }

    config.clear()
    this.log('See you soon! 👋')

    if (config.hasEnvVarsConfigured()) {
      this.warn(`${commonMessages.envCredentialsConfigured} You are still authenticated through them until you remove them.`)
    }
  }
}
