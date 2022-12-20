import { prompt } from 'inquirer'
import { Command, Flags } from '@oclif/core'
import config from '../services/config'

export default class Logout extends Command {
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

    if (!force) {
      const message = `You are about to clear your local session of
        \`${config.data.get('accountName')}\`, do you want to continue?`

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
    console.info('See you soon! 👋')

    this.exit(0)
  }
}
