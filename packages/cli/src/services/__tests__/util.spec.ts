import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { pathToPosix, isFileSync, getPlaywrightVersion } from '../util'

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

  describe('getPlaywrightVersion', () => {

    const fixturesDir = path.resolve(__dirname, '../__tests__/fixtures/lock-files')

    const npmLockFile = path.join(fixturesDir, 'package-lock.json')
    const pnpmLockFile = path.join(fixturesDir, 'pnpm-lock.yaml')
    const yarnLockFile = path.join(fixturesDir, 'yarn.lock')


    it('returns version from package-lock.json with packages', async () => {
      const version = await getPlaywrightVersion(npmLockFile)
      expect(version).toBe('1.52.0')
    })

    it('returns version from pnpm-lock.yaml', async () => {
      const version = await getPlaywrightVersion(pnpmLockFile)
      expect(version).toBe('1.52.0')
    })

    it('returns version from yarn.lock', async () => {
      const version = await getPlaywrightVersion(yarnLockFile)
      expect(version).toBe('1.52.0')
    })


    it('returns undefined if lockFile is not provided', async () => {
      const version = await getPlaywrightVersion(undefined as any)
      expect(version).toBeUndefined()
    })
  })
})
