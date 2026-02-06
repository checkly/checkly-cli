import { describe, it, expect, beforeEach } from 'vitest'

import { Session } from '../project'

describe('Session.sanitizeLogicalId', () => {
  beforeEach(() => {
    Session.clearSanitizedLogicalIds()
  })

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

  it('should track sanitized logicalIds when constructType is provided', () => {
    Session.sanitizeLogicalId('my check', 'check')
    Session.sanitizeLogicalId('valid-id', 'check')
    Session.sanitizeLogicalId('another (invalid)', 'check-group')

    const sanitizedIds = Session.getSanitizedLogicalIds()
    expect(sanitizedIds).toHaveLength(2)
    expect(sanitizedIds[0]).toEqual({
      constructType: 'check',
      original: 'my check',
      sanitized: 'mycheck',
    })
    expect(sanitizedIds[1]).toEqual({
      constructType: 'check-group',
      original: 'another (invalid)',
      sanitized: 'anotherinvalid',
    })
  })

  it('should not track sanitized logicalIds when constructType is not provided', () => {
    Session.sanitizeLogicalId('my check')
    Session.sanitizeLogicalId('another (invalid)')

    const sanitizedIds = Session.getSanitizedLogicalIds()
    expect(sanitizedIds).toHaveLength(0)
  })

  it('should clear sanitized logicalIds', () => {
    Session.sanitizeLogicalId('my check', 'check')
    expect(Session.getSanitizedLogicalIds()).toHaveLength(1)

    Session.clearSanitizedLogicalIds()
    expect(Session.getSanitizedLogicalIds()).toHaveLength(0)
  })
})
