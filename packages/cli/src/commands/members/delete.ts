import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { resolveAccountMemberTarget } from '../../helpers/account-member-target.js'

export default class AccountMembersDelete extends AuthCommand {
  static hidden = false
  static hiddenAliases = ['account members delete']
  static destructive = true
  static idempotent = true
  static description = 'Delete an account member.'

  static args = {
    member: Args.string({
      name: 'member',
      required: true,
      description: 'The account member email or user ID.',
    }),
  }

  static flags = {
    'email': Flags.boolean({
      description: 'Treat the member argument as an email address.',
      default: false,
      exclusive: ['id'],
    }),
    'id': Flags.boolean({
      description: 'Treat the member argument as a user ID.',
      default: false,
      exclusive: ['email'],
    }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountMembersDelete)

    let target
    try {
      target = await resolveAccountMemberTarget(args.member, flags)
    } catch (err: any) {
      this.style.longError('Failed to resolve account member.', err)
      process.exitCode = 1
      return
    }
    const previewFlags: Record<string, unknown> = {
      ...flags,
      email: flags.email || undefined,
      id: flags.id || undefined,
    }

    await this.confirmOrAbort({
      command: 'members delete',
      description: 'Delete account member',
      changes: [
        `Delete account member "${target.label}"`,
      ],
      flags: previewFlags,
      args: { member: args.member },
      classification: {
        readOnly: AccountMembersDelete.readOnly,
        destructive: AccountMembersDelete.destructive,
        idempotent: AccountMembersDelete.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      await api.accountMembers.delete(target.userId)
      this.style.shortSuccess(`Account member "${target.label}" deleted.`)
    } catch (err: any) {
      this.style.longError('Failed to delete account member.', err)
      process.exitCode = 1
    }
  }
}
