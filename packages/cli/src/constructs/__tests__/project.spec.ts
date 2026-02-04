import { describe, it, expect } from 'vitest'

import { Session } from '../project'

describe('Session.sanitizeLogicalId', () => {
  it('should return valid logicalIds unchanged', () => {
    expect(Session.sanitizeLogicalId('my-check')).toBe('my-check')
    expect(Session.sanitizeLogicalId('my_check')).toBe('my_check')
    expect(Session.sanitizeLogicalId('myCheck123')).toBe('myCheck123')
    expect(Session.sanitizeLogicalId('my/check')).toBe('my/check')
    expect(Session.sanitizeLogicalId('my#check')).toBe('my#check')
    expect(Session.sanitizeLogicalId('my.check')).toBe('my.check')
  })

  it('should strip spaces from logicalIds', () => {
    expect(Session.sanitizeLogicalId('my check')).toBe('mycheck')
    expect(Session.sanitizeLogicalId('my check name')).toBe('mycheckname')
  })

  it('should strip special characters from logicalIds', () => {
    expect(Session.sanitizeLogicalId('my(check)')).toBe('mycheck')
    expect(Session.sanitizeLogicalId('my@check!')).toBe('mycheck')
    expect(Session.sanitizeLogicalId('my$check%name')).toBe('mycheckname')
  })

  it('should handle mixed valid and invalid characters', () => {
    expect(Session.sanitizeLogicalId('my-check (test)')).toBe('my-checktest')
    expect(Session.sanitizeLogicalId('API Check #1')).toBe('APICheck#1')
  })

  it('should return empty string for all invalid characters', () => {
    expect(Session.sanitizeLogicalId('   ')).toBe('')
    expect(Session.sanitizeLogicalId('!@$%^&*()')).toBe('')
  })
})
