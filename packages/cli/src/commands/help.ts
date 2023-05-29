import { BaseCommand } from './baseCommand'
import ChecklyHelpClass from '../help/help-extension'

export default class Logout extends BaseCommand {
  static hidden = false
  static description = 'Display help for <%= config.bin %>.'

  async run (): Promise<void> {
    const help = new ChecklyHelpClass(this.config)
    await help.showHelp([])
  }
}
