import { describe, it, expect } from 'vitest'
import { shellQuote, shellJoin } from '../shell'

describe('shell', () => {
  describe('shellQuote', () => {
    it('returns empty string as quoted', () => {
      expect(shellQuote('')).toBe('\'\'')
    })

    it('leaves safe characters unquoted', () => {
      expect(shellQuote('@TAG-B')).toBe('@TAG-B')
      expect(shellQuote('--grep')).toBe('--grep')
      expect(shellQuote('path/to/file.ts')).toBe('path/to/file.ts')
      expect(shellQuote('simple')).toBe('simple')
      expect(shellQuote('100%')).toBe('100%')
    })

    it('quotes strings with spaces', () => {
      expect(shellQuote('@foo bar')).toBe('\'@foo bar\'')
    })

    it('quotes strings with shell metacharacters', () => {
      expect(shellQuote('test|pattern')).toBe('\'test|pattern\'')
      expect(shellQuote('$var')).toBe('\'$var\'')
      expect(shellQuote('cmd;rm -rf')).toBe('\'cmd;rm -rf\'')
      expect(shellQuote('a*b')).toBe('\'a*b\'')
      expect(shellQuote('(foo)')).toBe('\'(foo)\'')
    })

    it('escapes embedded single quotes', () => {
      expect(shellQuote('it\'s')).toBe('\'it\'"\'"\'s\'')
    })
  })

  describe('shellJoin', () => {
    it('joins args with proper quoting', () => {
      expect(shellJoin(['--grep', '@TAG-B'])).toBe('--grep @TAG-B')
      expect(shellJoin(['--grep', '@foo bar'])).toBe('--grep \'@foo bar\'')
      expect(shellJoin(['npx', 'playwright', 'test', '--grep', 'a|b'])).toBe('npx playwright test --grep \'a|b\'')
    })

    it('handles empty array', () => {
      expect(shellJoin([])).toBe('')
    })
  })
})
