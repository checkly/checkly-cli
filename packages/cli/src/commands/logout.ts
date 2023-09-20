import prompts from 'prompts'
import { Flags } from '@oclif/core'
import config from '../services/config'
import { BaseCommand } from './baseCommand'
import commonMessages from '../messages/common-messages'

export default class Logout extends BaseCommand {
  static hidden = false
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
  }
}
