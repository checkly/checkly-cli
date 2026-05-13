import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../render.js'
import {
  formatAccountMembers,
  formatCursorNavigationHints,
  formatCursorPaginationInfo,
} from '../account-members.js'
import type { AccountMember } from '../../rest/account-members.js'

const activeMember: AccountMember = {
  type: 'member',
  accountId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  name: 'Owner User',
  email: 'owner@example.com',
  role: 'OWNER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  isSupportMembership: true,
  ssoEnabled: true,
  mfaEnabled: true,
}

const pendingInvite: AccountMember = {
  type: 'invite',
  id: '33333333-3333-3333-3333-333333333333',
  accountId: '11111111-1111-1111-1111-111111111111',
  email: 'pending@example.com',
  role: 'READ_ONLY',
  status: 'PENDING',
  inviterEmail: 'owner@example.com',
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  expiresAt: '2026-02-03T00:00:00.000Z',
}

const expiredInvite: AccountMember = {
  ...pendingInvite,
  id: '44444444-4444-4444-4444-444444444444',
  email: 'expired@example.com',
  status: 'EXPIRED',
}

describe('formatAccountMembers', () => {
  it('renders active member security and support fields', () => {
    const result = stripAnsi(formatAccountMembers([activeMember], 'terminal'))

    expect(result).toContain('TYPE')
    expect(result).toContain('owner@example.com')
    expect(result).toContain('Owner User')
    expect(result).toContain('OWNER')
    expect(result).toContain('ACTIVE')
    expect(result).toContain('yes')
    expect(result).toContain('22222222-2222-2222-2222-222222222222')
  })

  it('renders pending invite with expiry and invite id', () => {
    const result = stripAnsi(formatAccountMembers([pendingInvite], 'terminal'))

    expect(result).toContain('invite')
    expect(result).toContain('pending@example.com')
    expect(result).toContain('READ_ONLY')
    expect(result).toContain('PENDING')
    expect(result).toContain('2026-02-03 00:00:00')
    expect(result).toContain('33333333-3333-3333-3333-333333333333')
  })

  it('renders expired invite status', () => {
    const result = stripAnsi(formatAccountMembers([expiredInvite], 'terminal'))

    expect(result).toContain('expired@example.com')
    expect(result).toContain('EXPIRED')
  })

  it('renders markdown output', () => {
    const result = formatAccountMembers([activeMember, pendingInvite], 'md')

    expect(result).toContain('| Type | Email | Name | Role | Status | MFA | SSO | Support | Expires | ID |')
    expect(result).toContain('| member | owner@example.com | Owner User | OWNER | ACTIVE | yes | yes | yes | - | 22222222-2222-2222-2222-222222222222 |')
    expect(result).toContain('| invite | pending@example.com | - | READ_ONLY | PENDING | - | - | - | 2026-02-03 00:00:00 UTC | 33333333-3333-3333-3333-333333333333 |')
  })

  it('hides IDs when requested', () => {
    const result = stripAnsi(formatAccountMembers([activeMember, pendingInvite], 'terminal', { showId: false }))

    expect(result).not.toContain('ID')
    expect(result).not.toContain('22222222-2222-2222-2222-222222222222')
    expect(result).not.toContain('33333333-3333-3333-3333-333333333333')
  })

  it('renders cursor pagination info', () => {
    expect(stripAnsi(formatCursorPaginationInfo(2, 'next-cursor'))).toBe('Showing 2 account members (more available)')
    expect(stripAnsi(formatCursorPaginationInfo(1, null))).toBe('Showing 1 account member')
  })

  it('renders next page hint when cursor exists', () => {
    const result = stripAnsi(formatCursorNavigationHints('next-cursor'))

    expect(result).toContain('--next-id next-cursor')
  })
})
