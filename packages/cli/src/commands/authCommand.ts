import prompts from 'prompts'
import { BaseCommand } from './baseCommand.js'
import * as api from '../rest/api.js'
import { Account } from '../rest/accounts.js'
import { Session } from '../constructs/session.js'
import { Diagnostics } from '../constructs/diagnostics.js'
import { detectCliMode } from '../helpers/cli-mode.js'
import type { Project } from '../constructs/project.js'
import type { CommandPreview } from '../helpers/command-preview.js'
import { formatPreviewForAgent, formatPreviewForTerminal } from '../helpers/command-preview.js'

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
    await super.init()
    this.#account = await api.validateAuthentication()
    // Constructs validate against account-specific limits and have no access to
    // the command instance.
    Session.accountFeatures = this.#account?.features ?? []
  }

  protected async validateProject (
    project: Project,
    options: {
      configDiagnostics: Diagnostics
      failureMessage?: string
    },
  ): Promise<void> {
    const {
      configDiagnostics,
      failureMessage = `Unable to continue due to unresolved validation errors.`,
    } = options

    this.style.actionStart('Validating project resources')

    const diagnostics = new Diagnostics()
    // Config diagnostics come first so that they render before any
    // project-level diagnostics.
    diagnostics.extend(configDiagnostics)
    await project.validate(diagnostics)

    this.style.diagnostics(diagnostics)

    if (diagnostics.isFatal()) {
      this.style.actionFailure()
      this.style.shortError(failureMessage)
      this.exit(1)
    }

    this.style.actionSuccess()
  }

  protected async confirmOrAbort (
    preview: CommandPreview,
    options: { force: boolean, dryRun?: boolean, interactiveConfirm?: () => Promise<boolean> },
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

      if (options.interactiveConfirm !== undefined) {
        if (!await options.interactiveConfirm()) {
          return this.exit(0)
        }
        return
      }

      const question = preview.question ?? 'Proceed?'
      const alternatives = preview.terminal?.alternatives ?? []
      if (alternatives.length === 0) {
        const { confirm } = await prompts({ name: 'confirm', type: 'confirm', message: question })
        if (!confirm) {
          return this.exit(0)
        }
        return
      }

      // With something else on offer, the yes/no question becomes a list. The
      // cursor starts on Cancel, so Enter alone applies nothing — as the
      // confirm's default of No did.
      const choices = [
        { title: 'Yes, apply these changes', value: 'apply' },
        ...alternatives.map((alternative, index) => ({ title: alternative.title, value: `alternative:${index}` })),
        { title: 'Cancel', value: 'cancel' },
      ]
      const { action } = await prompts({
        name: 'action',
        type: 'select',
        message: question,
        choices,
        initial: choices.length - 1,
      })
      if (action === 'apply') {
        return
      }
      if (typeof action === 'string' && action.startsWith('alternative:')) {
        await alternatives[Number(action.slice('alternative:'.length))].run()
      }
      return this.exit(0)
    }

    // Agent or CI mode: output structured JSON and exit 2
    this.log(JSON.stringify(formatPreviewForAgent(preview, 'confirmation_required'), null, 2))
    return this.exit(2)
  }
}
