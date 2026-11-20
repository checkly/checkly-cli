import { Args } from '@oclif/core'
import { AuthCommand } from '../../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../../helpers/flags.js'
import { exitCodeFor } from '../../../helpers/invalid-input-error.js'
import {
  describeSpendingLimitError,
  MAX_SPENDING_LIMIT_DOLLARS,
  parseDollarsToCents,
  spendingLimitChanges,
} from '../../../helpers/spending-limit.js'
import * as api from '../../../rest/api.js'
import { formatDollars } from '../../../formatters/spending-limit.js'

export default class AccountSpendingLimitSet extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = false
  static idempotent = true
  static description = 'Set or change the overage spending limit. Checks stop running once overage reaches it.'

  static args = {
    dollars: Args.string({
      required: true,
      description: `The limit in US dollars, e.g. 50 or 12.50 (0 to ${MAX_SPENDING_LIMIT_DOLLARS}).`,
    }),
  }

  static flags = {
    'output': outputFlag({ default: 'detail' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountSpendingLimitSet)
    this.style.outputFormat = flags.output
    const capCents = parseDollarsToCents(args.dollars)

    let current
    try {
      ({ data: current } = await api.spendingLimit.get())
    } catch (err: unknown) {
      this.style.longError('Failed to load the spending limit.', describeSpendingLimitError(err, 'billing:read'))
      process.exitCode = exitCodeFor(err)
      return
    }

    await this.confirmOrAbort({
      command: 'account spending-limit set',
      description: 'Set the spending limit',
      changes: spendingLimitChanges(current, capCents),
      flags,
      args: { dollars: args.dollars },
      classification: {
        readOnly: AccountSpendingLimitSet.readOnly,
        destructive: AccountSpendingLimitSet.destructive,
        idempotent: AccountSpendingLimitSet.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const { data } = await api.spendingLimit.update(capCents)
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }
      this.style.shortSuccess(`Spending limit set to ${formatDollars(data.spendingCapCents ?? capCents)}.`)
    } catch (err: unknown) {
      this.style.longError('Failed to set the spending limit.', describeSpendingLimitError(err, 'billing:update'))
      process.exitCode = exitCodeFor(err)
    }
  }
}
