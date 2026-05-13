import type { AxiosInstance } from 'axios'

export type AccountMemberRole = 'OWNER' | 'ADMIN' | 'READ_WRITE' | 'READ_RUN' | 'READ_ONLY'
export type AccountMemberType = 'member' | 'invite'
export type AccountMemberStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED'

export interface ActiveAccountMember {
  type: 'member'
  accountId: string
  userId: string
  name: string | null
  email: string
  role: AccountMemberRole
  status: 'ACTIVE'
  createdAt: string
  updatedAt: string
  isSupportMembership: boolean
  ssoEnabled: boolean
  mfaEnabled: boolean
}

export interface AccountInvite {
  type: 'invite'
  id: string
  accountId: string
  email: string
  role: Exclude<AccountMemberRole, 'OWNER'>
  status: 'PENDING' | 'EXPIRED'
  inviterEmail: string
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export type AccountMember = ActiveAccountMember | AccountInvite

export interface AccountMembersResponse {
  members: AccountMember[]
  length: number
  nextId: string | null
}

export interface AccountMembersListParams {
  search?: string
  type?: AccountMemberType
  role?: AccountMemberRole
  status?: AccountMemberStatus
  limit?: number
  nextId?: string
}

class AccountMembers {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll (params?: AccountMembersListParams) {
    return this.api.get<AccountMembersResponse>('/v1/accounts/me/members', { params })
  }
}

export default AccountMembers
