import * as api from '../rest/api.js'
import type { ActiveAccountMember } from '../rest/account-members.js'

type AccountMemberTargetKind = 'email' | 'id'

export interface AccountMemberTargetFlags {
  email?: boolean
  id?: boolean
}

export interface ResolvedAccountMemberTarget {
  userId: string
  label: string
  member?: ActiveAccountMember
  kind: AccountMemberTargetKind
}

function inferTargetKind (target: string, flags: AccountMemberTargetFlags): AccountMemberTargetKind {
  if (flags.email) return 'email'
  if (flags.id) return 'id'
  return target.includes('@') ? 'email' : 'id'
}

export async function resolveAccountMemberTarget (
  target: string,
  flags: AccountMemberTargetFlags = {},
): Promise<ResolvedAccountMemberTarget> {
  const kind = inferTargetKind(target, flags)
  if (kind === 'id') {
    return { userId: target, label: target, kind }
  }

  const email = target.trim().toLowerCase()
  const { data } = await api.accountMembers.getAll({
    search: target,
    type: 'member',
    status: 'ACTIVE',
  })
  const exactMatches = data.members
    .filter((member): member is ActiveAccountMember => member.type === 'member')
    .filter(member => member.email.toLowerCase() === email)

  if (exactMatches.length === 0) {
    throw new Error(`No active account member found with email "${target}".`)
  }

  if (exactMatches.length > 1) {
    throw new Error(`Multiple active account members found with email "${target}". Use --id with the member user ID instead.`)
  }

  const member = exactMatches[0]
  return {
    userId: member.userId,
    label: `${member.email} (${member.userId})`,
    member,
    kind,
  }
}
