import { describe, expect, it } from 'vitest'
import {
  normalizeAccountMemberRole,
  normalizeAccountMemberStatus,
  normalizeAccountMemberType,
} from '../members.js'

describe('account members flag normalization', () => {
  it('normalizes type values case-insensitively', () => {
    expect(normalizeAccountMemberType('member')).toBe('member')
    expect(normalizeAccountMemberType('INVITE')).toBe('invite')
    expect(normalizeAccountMemberType(' Invite ')).toBe('invite')
  })

  it('normalizes role values case-insensitively', () => {
    expect(normalizeAccountMemberRole('admin')).toBe('ADMIN')
    expect(normalizeAccountMemberRole('Read_Run')).toBe('READ_RUN')
    expect(normalizeAccountMemberRole(' read_only ')).toBe('READ_ONLY')
  })

  it('normalizes status values case-insensitively', () => {
    expect(normalizeAccountMemberStatus('active')).toBe('ACTIVE')
    expect(normalizeAccountMemberStatus('Pending')).toBe('PENDING')
    expect(normalizeAccountMemberStatus(' expired ')).toBe('EXPIRED')
  })

  it('returns undefined for invalid filter values', () => {
    expect(normalizeAccountMemberType('user')).toBeUndefined()
    expect(normalizeAccountMemberRole('superadmin')).toBeUndefined()
    expect(normalizeAccountMemberStatus('disabled')).toBeUndefined()
  })
})
