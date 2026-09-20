import { describe, expect, test } from 'vitest'

import { filterByCheckFiles, filterByFileNamePattern, filterByCheckNamePattern, filterByTags } from '../test-filters.js'

describe('filterByCheckFiles()', () => {
  // A check declared in src/lib/factory.ts on behalf of src/checks/a.check.ts.
  const files = { sourceFile: 'src/lib/factory.ts', loadedFrom: 'src/checks/a.check.ts' }

  test('selects a check by the file that declares it', () => {
    expect(filterByCheckFiles(['lib/factory'], files)).toBe(true)
  })

  test('selects a check by the check file that loaded it', () => {
    expect(filterByCheckFiles(['a.check'], files)).toBe(true)
  })

  test('selects a browser check by its script', () => {
    expect(filterByCheckFiles(['home.spec'], { ...files, entrypoint: 'src/checks/home.spec.ts' })).toBe(true)
  })

  test('leaves out a check none of the files name', () => {
    expect(filterByCheckFiles(['b.check'], { ...files, entrypoint: 'src/checks/home.spec.ts' })).toBe(false)
    expect(filterByCheckFiles(['a.check'], {})).toBe(false)
  })

  test('never matches a file it does not know', () => {
    expect(filterByCheckFiles(['undefined'], files)).toBe(false)
    expect(filterByCheckFiles(['def'], {})).toBe(false)
  })
})

describe('filterByCheckNamePattern()', () => {
  type TestTuple = [string, string, boolean]

  const cases: TestTuple[] = [
    ['', 'My Checkly Check', true],
    ['', '', true],
    ['.*', 'My Checkly Check', true],
    ['Check', 'My Checkly Check', true],
    ['Browser', 'My Checkly Check', false],
    ['check', 'My Checkly Check', false],
  ]
  test.each(cases)('pattern %s with name "%s" should match %s', (pattern, name, expected) => {
    expect(filterByCheckNamePattern(pattern, name)).toEqual(expected)
  })
})

describe('filterByFileNamePattern()', () => {
  type TestTuple = [string[], string, boolean]

  const cases: TestTuple[] = [
    [['.*'], '', true],
    [['spe.*'], 'check.spec.js', true],
    [['spec'], 'check.spec.js', true],
    [['__checks__'], '__checks__/some-dir/check.spec.js', true],
    [['spec', 'no-match'], 'check.spec.js', true],
    [['no-match'], 'check.spec.js', false],
    [['check.e2e'], 'check.spec.js', false],
  ]
  test.each(cases)('patterns %s with path "%s" should match %s', (patterns, path, expected) => {
    expect(filterByFileNamePattern(patterns, path)).toEqual(expected)
  })
})

describe('filterByTags()', () => {
  type TestTuple = [string[][], string[], boolean]

  const cases: TestTuple[] = [
    [[[], []], [], true],
    [[['production']], ['production'], true],
    [[['production']], ['production', 'api'], true],
    [[['production', 'api']], ['api', 'production'], true],
    [[['production'], ['api']], ['api', 'production'], true],
    [[['production'], ['web']], ['production', 'api'], true],
    [[['production']], ['staging'], false],
    [[['production', 'web']], ['production', 'api'], false],
  ]
  test.each(cases)('patterns %s with path "%s" should match %s', (targetTags, tags, expected) => {
    expect(filterByTags(targetTags, tags)).toEqual(expected)
  })
})
