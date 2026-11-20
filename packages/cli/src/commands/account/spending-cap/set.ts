import { Args } from '@oclif/core'
import { AuthCommand } from '../../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../../helpers/flags.js'
import { exitCodeFor } from '../../../helpers/invalid-input-error.js'
import {
  describeSpendingCapError,
  MAX_SPENDING_CAP_DOLLARS,
  parseDollarsToCents,
  spendingCapChanges,
} from '../../../helpers/spending-cap.js'
import * as api from '../../../rest/api.js'
import { formatDollars } from '../../../formatters/spending-cap.js'

export default class AccountSpendingCapSet extends AuthCommand {
  static hidden = false
  static readOnly = false
  static destructive = false
  static idempotent = true
  static description = 'Set or change the overage spending cap. Checks stop running once overage reaches it.'

  static args = {
    dollars: Args.string({
      required: true,
      description: `The cap in US dollars, e.g. 50 or 12.50 (0 to ${MAX_SPENDING_CAP_DOLLARS}).`,
    }),
  }

  static flags = {
    'output': outputFlag({ default: 'detail' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountSpendingCapSet)
    this.style.outputFormat = flags.output
    const capCents = parseDollarsToCents(args.dollars)

    let current
    try {
      ({ data: current } = await api.spendingCap.get())
    } catch (err: unknown) {
      this.style.longError('Failed to load the spending cap.', describeSpendingCapError(err, 'billing:read'))
      process.exitCode = exitCodeFor(err)
      return
    }

    await this.confirmOrAbort({
      command: 'account spending-cap set',
      description: 'Set the spending cap',
      changes: spendingCapChanges(current, capCents),
      flags,
      args: { dollars: args.dollars },
      classification: {
        readOnly: AccountSpendingCapSet.readOnly,
        destructive: AccountSpendingCapSet.destructive,
        idempotent: AccountSpendingCapSet.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const { data } = await api.spendingCap.update(capCents)
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }
      this.style.shortSuccess(`Spending cap set to ${formatDollars(data.spendingCapCents ?? capCents)}.`)
    } catch (err: unknown) {
      this.style.longError('Failed to set the spending cap.', describeSpendingCapError(err, 'billing:update'))
      process.exitCode = exitCodeFor(err)
    }
  }
}
