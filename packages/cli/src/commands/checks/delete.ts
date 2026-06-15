import { Args } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { NotFoundError } from '../../rest/errors.js'

export default class ChecksDelete extends AuthCommand {
  static hidden = false
  static destructive = true
  static idempotent = true
  static description = 'Delete a check by ID. Checks managed by a CLI project are recreated on the next deploy '
    + '— remove those from your project code instead.'

  static args = {
    id: Args.string({
      name: 'id',
      required: true,
      description: 'The ID of the check to delete.',
    }),
  }

  static flags = {
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(ChecksDelete)

    let check
    try {
      const { data } = await api.checks.get(args.id)
      check = data
    } catch (err: any) {
      if (err instanceof NotFoundError) {
        this.style.shortError(`Check "${args.id}" not found. It may have already been deleted.`)
      } else {
        this.style.longError('Failed to find check.', err)
      }
      process.exitCode = 1
      return
    }

    await this.confirmOrAbort({
      command: 'checks delete',
      description: 'Delete check',
      changes: [
        `Delete check "${check.name}" (${check.checkType})`,
        'If this check is managed by a CLI project, it will be recreated on the next deploy',
      ],
      flags,
      args: { id: args.id },
      classification: {
        readOnly: ChecksDelete.readOnly,
        destructive: ChecksDelete.destructive,
        idempotent: ChecksDelete.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      await api.checks.delete(args.id)
      this.style.shortSuccess(`Check "${check.name}" deleted.`)
    } catch (err: any) {
      this.style.longError('Failed to delete check.', err)
      process.exitCode = 1
    }
  }
}
