import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  pathToPosix,
  isFileSync,
  getPlaywrightVersionFromPackage,
} from '../util'

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

  describe('getPlaywrightVersionFromPackage()', () => {
    it('should throw error when playwright package is not found', () => {
      // Use a directory that doesn't have playwright installed
      const nonExistentDir = '/tmp/non-existent-dir'
      expect(() => getPlaywrightVersionFromPackage(nonExistentDir))
        .toThrow('Could not find @playwright/test package. Make sure it is installed.')
    })

    it('should get version from installed playwright package', () => {
      // Use the current working directory which should have playwright installed
      const currentDir = process.cwd()
      const version = getPlaywrightVersionFromPackage(currentDir)

      // Should return a valid semver version
      expect(version).toMatch(/^\d+\.\d+\.\d+/)
    })
  })
})
