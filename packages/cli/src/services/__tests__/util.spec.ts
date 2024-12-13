import * as path from 'path'
import { pathToPosix, isFileSync, uniqValFromArrByKey, compareObjectsWithExistingKeys } from '../util'
import { uniqValFromArrByKeyCases } from './__testcases__/uniqvalromarrbykey.case'
import { compareObjectsWithExistingKeysCases } from './__testcases__/compareobjectswithexistingkeys.case'

describe('util', () => {
  describe('pathToPosix()', () => {
    it('should convert Windows paths', () => {
      expect(pathToPosix('src\\__checks__\\my_check.spec.ts', '\\'))
        .toEqual('src/__checks__/my_check.spec.ts')
    })

    it('should have no effect on linux paths', () => {
      expect(pathToPosix('src/__checks__/my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    })
  })
  describe('isFileSync()', () => {
    it('should determine if a file is present at a given path', () => {
      expect(isFileSync(path.join(__dirname, '/fixtures/this-is-a-file.ts'))).toBeTruthy()
    })
    it('should determine if a file is not present at a given path', () => {
      expect(isFileSync('some random string')).toBeFalsy()
    })
  })

  describe('uniqValFromArrByKey()', () => {
    uniqValFromArrByKeyCases.forEach(({ input, expected }, index) => {
      it(`should return unique values from array grouped by key for test case ${index + 1}`, () => {
        const result = uniqValFromArrByKey(input.arr, input.key)
        expect(result).toEqual(expected)
      })
    })
  })

  describe('compareObjectsWithExistingKeys()', () => {
    compareObjectsWithExistingKeysCases.forEach(({ input, expected }, index) => {
      it(`should compare objects and return differences for test case ${index + 1}`, () => {
        const result = compareObjectsWithExistingKeys(input.obj1, input.obj2)
        expect(result).toEqual(expected)
      })
    })
  })
})
