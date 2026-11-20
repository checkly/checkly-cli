import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { exitCodeFor } from '../../helpers/invalid-input-error.js'
import { describeSpendingCapError } from '../../helpers/spending-cap.js'
import * as api from '../../rest/api.js'
import type { OutputFormat } from '../../formatters/render.js'
import { formatSpendingCap } from '../../formatters/spending-cap.js'

export default class AccountSpendingCap extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Show the overage spending cap, the overage spent so far, and whether checks are stopped.'

  static flags = {
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AccountSpendingCap)
    this.style.outputFormat = flags.output
    try {
      const { data } = await api.spendingCap.get()
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(formatSpendingCap(data, fmt))
    } catch (err: unknown) {
      this.style.longError('Failed to load the spending cap.', describeSpendingCapError(err, 'billing:read'))
      process.exitCode = exitCodeFor(err)
    }
  }
}
