import { prompt } from 'inquirer'
import { Flags } from '@oclif/core'
import config from '../services/config'
import { BaseCommand } from './baseCommand'

export default class Logout extends BaseCommand {
  static hidden = false
  static description = 'Logout and clear local conf'
  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'force mode',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Logout)
    const { force } = flags
    const accountName = config.data.get('accountName')

    if (!force) {
      const message = `You are about to clear your local session${accountName
        ? ' of "' + accountName + '"'
        : ''}, do you want to continue?`

      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message,
      }])

      if (!confirm) {
        this.exit(0)
      }
    }

    config.clear()
    this.log('See you soon! 👋')
  }
}
