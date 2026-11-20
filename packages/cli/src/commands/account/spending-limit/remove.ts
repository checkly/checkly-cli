import { AuthCommand } from '../../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../../helpers/flags.js'
import { exitCodeFor } from '../../../helpers/invalid-input-error.js'
import { describeSpendingLimitError, spendingLimitChanges } from '../../../helpers/spending-limit.js'
import * as api from '../../../rest/api.js'

export default class AccountSpendingLimitRemove extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = true
  static idempotent = true
  static description = 'Remove the overage spending limit, so overage is no longer capped.'

  static flags = {
    'output': outputFlag({ default: 'detail' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AccountSpendingLimitRemove)
    this.style.outputFormat = flags.output

    let current
    try {
      ({ data: current } = await api.spendingLimit.get())
    } catch (err: unknown) {
      this.style.longError('Failed to load the spending limit.', describeSpendingLimitError(err, 'billing:read'))
      process.exitCode = exitCodeFor(err)
      return
    }

    await this.confirmOrAbort({
      command: 'account spending-limit remove',
      description: 'Remove the spending limit',
      changes: spendingLimitChanges(current, null),
      flags,
      classification: {
        readOnly: AccountSpendingLimitRemove.readOnly,
        destructive: AccountSpendingLimitRemove.destructive,
        idempotent: AccountSpendingLimitRemove.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const { data } = await api.spendingLimit.update(null)
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }
      this.style.shortSuccess('Spending limit removed. Overage is no longer capped.')
    } catch (err: unknown) {
      this.style.longError('Failed to remove the spending limit.', describeSpendingLimitError(err, 'billing:update'))
      process.exitCode = exitCodeFor(err)
    }
  }
}
