import * as path from 'path'
import { hasPackageJsonFile, readPackageJson } from '../package'

describe('hasPackageJsonFile()', () => {
  type TestTuple = [string, boolean]
  const cases: TestTuple[] = [
    [path.join(__dirname, './fixtures/empty-project/'), false],
    [path.join(__dirname, './fixtures/initiated-project/'), true],
  ]
  test.each(cases)('directory %s should return valid = %s', (dir, expected) => {
    process.chdir(dir)
    expect(hasPackageJsonFile()).toEqual(expected)
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
    process.chdir(dir)
    try {
      expect(readPackageJson().name).toEqual(expected)
    } catch (error: any) {
      expect(expected).toEqual('')
      expect(error.message).toContain('ENOENT: no such file or directory')
    }
  })
})
