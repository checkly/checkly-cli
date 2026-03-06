import prompts from 'prompts'
import { BaseCommand } from './baseCommand'
import * as api from '../rest/api'
import { Account } from '../rest/accounts'
import { detectCliMode } from '../helpers/cli-mode'
import type { CommandPreview } from '../helpers/command-preview'
import { formatPreviewForAgent, formatPreviewForTerminal } from '../helpers/command-preview'

export abstract class AuthCommand extends BaseCommand {
  static hidden = true

  #account?: Account

  get account (): Account {
    if (this.#account === undefined) {
      throw new Error('This command requires authentication.')
    }

    return this.#account
  }

  protected async init (): Promise<any> {
    super.init()
    this.#account = await api.validateAuthentication()
  }

  protected async confirmOrAbort (
    preview: CommandPreview,
    options: { force: boolean, dryRun: boolean },
  ): Promise<void> {
    const CommandClass = this.constructor as typeof BaseCommand

    // --dry-run always shows preview and exits, regardless of other flags
    if (options.dryRun) {
      this.log(JSON.stringify(formatPreviewForAgent(preview, 'dry_run'), null, 2))
      return this.exit(0)
    }

    // Read-only commands never need confirmation
    if (CommandClass.readOnly) return

    // --force skips confirmation
    if (options.force) return

    const mode = detectCliMode()

    if (mode === 'interactive') {
      this.log(formatPreviewForTerminal(preview))
      this.log()
      const { confirm } = await prompts({
        name: 'confirm',
        type: 'confirm',
        message: 'Proceed?',
      })
      if (!confirm) {
        return this.exit(0)
      }
      return
    }

    // Agent or CI mode: output structured JSON and exit 2
    this.log(JSON.stringify(formatPreviewForAgent(preview, 'confirmation_required'), null, 2))
    return this.exit(2)
  }
}
