import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { dryRunFlag, forceFlag, outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import type { OutputFormat } from '../../formatters/render.js'
import { formatAccountMembers } from '../../formatters/account-members.js'
import type { AccountMemberUpdateRole } from '../../rest/account-members.js'
import { normalizeAccountMemberRole } from '../members.js'
import { resolveAccountMemberTarget } from '../../helpers/account-member-target.js'

const accountMemberUpdateRoles = ['ADMIN', 'READ_WRITE', 'READ_RUN', 'READ_ONLY'] as const
const accountMemberUpdateRoleOptions = accountMemberUpdateRoles.map(role => role.toLowerCase())

function isAccountMemberUpdateRole (value: string): value is AccountMemberUpdateRole {
  return accountMemberUpdateRoles.includes(value as AccountMemberUpdateRole)
}

export function normalizeAccountMemberUpdateRole (value: string | undefined): AccountMemberUpdateRole | undefined {
  const role = normalizeAccountMemberRole(value)
  return role && isAccountMemberUpdateRole(role) ? role : undefined
}

export default class AccountMembersUpdate extends AuthCommand {
  static hidden = false
  static hiddenAliases = ['account members update']
  static idempotent = true
  static description = 'Update an account member role.'

  static args = {
    member: Args.string({
      name: 'member',
      required: true,
      description: 'The account member email or user ID.',
    }),
  }

  static flags = {
    'role': Flags.string({
      char: 'r',
      description: `New member role: ${accountMemberUpdateRoleOptions.join(', ')}.`,
      required: true,
    }),
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
    'output': outputFlag({ default: 'table' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AccountMembersUpdate)
    this.style.outputFormat = flags.output

    const role = normalizeAccountMemberUpdateRole(flags.role)
    if (!role) {
      this.error(`Invalid --role "${flags.role}". Valid values: ${accountMemberUpdateRoleOptions.join(', ')}.`)
    }

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
      command: 'members update',
      description: 'Update account member role',
      changes: [
        `Update account member "${target.label}" role to ${role}`,
      ],
      flags: previewFlags,
      args: { member: args.member },
      classification: {
        readOnly: AccountMembersUpdate.readOnly,
        destructive: AccountMembersUpdate.destructive,
        idempotent: AccountMembersUpdate.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      const { data } = await api.accountMembers.updateRole(target.userId, role)

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatAccountMembers([data], fmt))
        return
      }

      this.style.shortSuccess(`Account member "${data.email}" updated.`)
      this.log(formatAccountMembers([data], fmt))
    } catch (err: any) {
      this.style.longError('Failed to update account member.', err)
      process.exitCode = 1
    }
  }
}
