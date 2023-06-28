import * as path from 'path'
import { isValidProjectDirectory } from '../directory'

describe('isValidProjectDirectory()', () => {
  type TestTuple = [string, boolean]

  const cases: TestTuple[] = [
    [path.join(__dirname, './fixtures/valid-dir'), true],
    [path.join(__dirname, './fixtures/invalid-dir-1'), false],
    [path.join(__dirname, './fixtures/empty-project'), false],
    [path.join(__dirname, './fixtures/initiated-project'), false],
    [path.join(__dirname, './fixtures/checkly-project'), false],
  ]
  test.each(cases)('directory %s should return valid = %s', (dir, expected) => {
    expect(isValidProjectDirectory(dir)).toEqual(expected)
  })
})
