import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import type { View } from '../../rest/views.js'
import { describeViewError, toViewPageOption } from '../../helpers/views.js'

export default class UiViewsDelete extends AuthCommand {
  static hidden = false
  static destructive = true
  static idempotent = true
  static description = 'Delete a saved view.'

  static examples = [
    'checkly ui-views delete <id>',
    'checkly ui-views delete <id> --dry-run',
  ]

  static args = {
    id: Args.string({
      description: 'The ID of the view to delete.',
      required: true,
    }),
  }

  static flags = {
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags, metadata } = await this.parse(UiViewsDelete)

    let view: View
    try {
      view = await api.views.get(args.id)
    } catch (err: any) {
      this.style.longError('Failed to delete view.', describeViewError(err) ?? err)
      process.exitCode = 1
      return
    }

    if (!view.canDelete) {
      this.style.longError('Failed to delete view.', 'Deleting shared views requires the views:delete permission')
      process.exitCode = 1
      return
    }

    await this.confirmOrAbort({
      command: 'ui-views delete',
      description: 'Delete saved view',
      changes: [
        `Delete view "${view.name}" (${view.id}) from the ${toViewPageOption(view.page)} page`,
        ...(view.visibility === 'ACCOUNT' ? ['The view is shared, so it is removed for everyone on the account'] : []),
      ],
      flags,
      flagMetadata: metadata.flags,
      args: { id: args.id },
      classification: {
        readOnly: UiViewsDelete.readOnly,
        destructive: UiViewsDelete.destructive,
        idempotent: UiViewsDelete.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      await api.views.delete(args.id)
      this.style.shortSuccess(`View "${view.name}" deleted.`)
    } catch (err: any) {
      this.style.longError('Failed to delete view.', describeViewError(err) ?? err)
      process.exitCode = 1
    }
  }
}
