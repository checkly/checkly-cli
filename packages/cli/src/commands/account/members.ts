import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatAccountMembers } from '../../formatters/account-members'

export default class AccountMembers extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List account members and pending invites.'

  static flags = {
    'hide-id': Flags.boolean({
      description: 'Hide member and invite IDs in table output.',
      default: false,
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AccountMembers)
    this.style.outputFormat = flags.output

    try {
      const { data } = await api.accountMembers.getAll()

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }

      if (data.members.length === 0) {
        this.log('No account members found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log(formatAccountMembers(data.members, fmt, { showId: !flags['hide-id'] }))
    } catch (err: any) {
      this.style.longError('Failed to list account members.', err)
      process.exitCode = 1
    }
  }
}
