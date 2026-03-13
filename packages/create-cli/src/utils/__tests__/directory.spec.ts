import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { collectConfigPaths, hasPackageJsonFile, isValidProjectDirectory, readPackageJson } from '../directory'

describe('isValidProjectDirectory()', () => {
  type TestTuple = [string, boolean]

  const cases: TestTuple[] = [
    [path.join(__dirname, './fixtures/valid-dir'), true],
    [path.join(__dirname, './fixtures/invalid-dir-1'), false],
    [path.join(__dirname, './fixtures/empty-project'), false],
    [path.join(__dirname, './fixtures/initiated-project'), true],
    [path.join(__dirname, './fixtures/checkly-project'), true],
  ]
  test.each(cases)('directory %s should return valid = %s', (dir, expected) => {
    expect(isValidProjectDirectory(dir)).toEqual(expected)
  })
})

describe('hasPackageJsonFile()', () => {
  type TestTuple = [string, boolean]
  const cases: TestTuple[] = [
    [path.join(__dirname, './fixtures/empty-project/'), false],
    [path.join(__dirname, './fixtures/initiated-project/'), true],
  ]
  test.each(cases)('directory %s should return valid = %s', (dir, expected) => {
    expect(hasPackageJsonFile(dir)).toEqual(expected)
  })
})

describe('collectConfigPaths()', () => {
  const suffixes = ['playwright.config.ts', 'playwright.config.js']

  test('finds configs recursively, sorted by depth then ts over js', () => {
    const fixtureDir = path.join(__dirname, './fixtures/playwright-multi')
    const results = collectConfigPaths(fixtureDir, suffixes)
      .map(r => path.relative(fixtureDir, r).split(path.sep).join('/'))
    expect(results).toEqual([
      'playwright.config.ts',
      'playwright.config.js',
      'staging/playwright.config.ts',
      'dev/playwright.config.js',
    ])
  })

  test('returns empty array when no matches', () => {
    const results = collectConfigPaths(path.join(__dirname, './fixtures/empty-project'), suffixes)
    expect(results).toEqual([])
  })
})

describe('readPackageJson()', () => {
  type TestTuple = [string, string]
  const cases: TestTuple[] = [
    [path.join(__dirname, './fixtures/empty-project/'), ''],
    [path.join(__dirname, './fixtures/initiated-project/'), 'initiated-project'],
    [path.join(__dirname, './fixtures/checkly-project/'), 'checkly-project'],
  ]
  test.each(cases)('directory %s should return name = %s', (dir, expected) => {
    try {
      expect(readPackageJson(dir).name).toEqual(expected)
    } catch (error: any) {
      expect(expected).toEqual('')
      expect(error.message).toContain('ENOENT: no such file or directory')
    }
  })
})
