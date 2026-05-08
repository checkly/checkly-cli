import { BaseCommand } from './baseCommand.js'
import ChecklyHelpClass from '../help/help-extension.js'

export default class Logout extends BaseCommand {
  static hidden = false
  static description = 'Display help for <%= config.bin %>.'

  async run (): Promise<void> {
    const help = new ChecklyHelpClass(this.config)
    await help.showHelp([])
  }
}
