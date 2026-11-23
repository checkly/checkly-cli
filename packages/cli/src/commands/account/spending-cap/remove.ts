import { AuthCommand } from '../../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../../helpers/flags.js'
import { exitCodeFor } from '../../../helpers/invalid-input-error.js'
import { describeSpendingCapError, spendingCapChanges } from '../../../helpers/spending-cap.js'
import * as api from '../../../rest/api.js'

export default class AccountSpendingCapRemove extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = true
  static idempotent = true
  static description = 'Remove the overage spending cap, so overage is no longer capped.'

  static flags = {
    'output': outputFlag({ default: 'detail' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AccountSpendingCapRemove)
    this.style.outputFormat = flags.output

    let current
    try {
      ({ data: current } = await api.spendingCap.get())
    } catch (err: unknown) {
      this.style.longError('Failed to load the spending cap.', describeSpendingCapError(err, 'billing:read'))
      process.exitCode = exitCodeFor(err)
      return
    }

    await this.confirmOrAbort({
      command: 'account spending-cap remove',
      description: 'Remove the spending cap',
      changes: spendingCapChanges(current, null),
      flags,
      classification: {
        readOnly: AccountSpendingCapRemove.readOnly,
        destructive: AccountSpendingCapRemove.destructive,
        idempotent: AccountSpendingCapRemove.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const { data } = await api.spendingCap.update(null)
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }
      this.style.shortSuccess('Spending cap removed. Overage is no longer capped.')
    } catch (err: unknown) {
      this.style.longError('Failed to remove the spending cap.', describeSpendingCapError(err, 'billing:update'))
      process.exitCode = exitCodeFor(err)
    }
  }
}
