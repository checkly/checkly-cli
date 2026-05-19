import { describe, expect, it } from 'vitest'
import { normalizeFlagAliases } from '../flags.js'

describe('normalizeFlagAliases', () => {
  const aliases = [
    { alias: '-te', flag: '--test-session-error-group' },
    { alias: '-eg', flag: '--error-group' },
  ]

  it('normalizes alias flags with separate values', () => {
    expect(normalizeFlagAliases(['-te', 'tseg-123'], aliases)).toEqual([
      '--test-session-error-group',
      'tseg-123',
    ])
  })

  it('normalizes alias flags with equals values', () => {
    expect(normalizeFlagAliases(['-te=tseg=123'], aliases)).toEqual([
      '--test-session-error-group=tseg=123',
    ])
  })

  it('normalizes multiple aliases', () => {
    expect(normalizeFlagAliases(['-eg', 'eg-123', '-te=tseg-123'], aliases)).toEqual([
      '--error-group',
      'eg-123',
      '--test-session-error-group=tseg-123',
    ])
  })

  it('leaves arguments after -- unchanged', () => {
    expect(normalizeFlagAliases(['-te', 'tseg-123', '--', '-eg'], aliases)).toEqual([
      '--test-session-error-group',
      'tseg-123',
      '--',
      '-eg',
    ])
  })

  it('leaves non-flag-shaped arguments unchanged', () => {
    expect(normalizeFlagAliases(['value=with-equals', '--test-session-error-group=tseg-123'], aliases)).toEqual([
      'value=with-equals',
      '--test-session-error-group=tseg-123',
    ])
  })

  it('returns a copy when no aliases are configured', () => {
    const argv = ['-te', 'tseg-123']
    const normalized = normalizeFlagAliases(argv, [])

    expect(normalized).toEqual(argv)
    expect(normalized).not.toBe(argv)
  })
})
