import prompts from 'prompts'
import { Flags } from '@oclif/core'
import config from '../services/config.js'
import { BaseCommand } from './baseCommand.js'
import commonMessages from '../messages/common-messages.js'
import { detectCliMode, isPersonAtTerminal } from '../helpers/cli-mode.js'

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

    // Only a person at a terminal can answer the confirmation. Elsewhere (an
    // agent, CI, a script) the prompt would get no answer and the command
    // would exit without logging out, so it logs out directly: that only
    // clears the local session, which `checkly login` restores.
    const canConfirm = detectCliMode() === 'interactive' && isPersonAtTerminal()

    if (!force && canConfirm) {
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

    if (config.getCredentialSource() === 'environment') {
      this.warn(`${commonMessages.envCredentialsConfigured} You are still authenticated through them until you remove them.`)
    }
  }
}
