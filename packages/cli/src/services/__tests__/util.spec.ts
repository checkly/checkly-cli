import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  pathToPosix,
  isFileSync,
  detectPlaywrightVersion,
  getVersionFromPackageLock,
  getVersionFromPnpmLock,
  getVersionFromYarnLock,
} from '../util'

const fixturesDir = path.resolve(__dirname, 'fixtures/lockfiles')

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

  describe('detectPlaywrightVersion()', () => {
    it('should extract version from package-lock.json', async () => {
      const result = await detectPlaywrightVersion(path.join(fixturesDir, 'package-lock.json'))
      expect(result).toBe('1.52.0')
    })

    it('should extract version from pnpm-lock.yaml', async () => {
      const result = await detectPlaywrightVersion(path.join(fixturesDir, 'pnpm-lock.yaml'))
      expect(result).toBe('1.52.0')
    })

    it('should extract version from yarn.lock', async () => {
      const result = await detectPlaywrightVersion(path.join(fixturesDir, 'yarn.lock'))
      expect(result).toBe('1.52.0')
    })

    it('should fall back to npm view for unknown lockfile type', async () => {
      const result = await detectPlaywrightVersion(path.join(fixturesDir, 'unknown.lock'))
      expect(result).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  describe('getVersionFromPackageLock()', () => {
    it('should extract version from packages field', async () => {
      const result = await getVersionFromPackageLock(fixturesDir)
      expect(result).toBe('1.52.0')
    })

    it('should return undefined when file missing', async () => {
      const result = await getVersionFromPackageLock('/tmp/non-existent-dir')
      expect(result).toBeUndefined()
    })
  })

  describe('getVersionFromPnpmLock()', () => {
    it('should extract version from pnpm-lock.yaml', async () => {
      const result = await getVersionFromPnpmLock(fixturesDir)
      expect(result).toBe('1.52.0')
    })

    it('should return undefined when file missing', async () => {
      const result = await getVersionFromPnpmLock('/tmp/non-existent-dir')
      expect(result).toBeUndefined()
    })
  })

  describe('getVersionFromYarnLock()', () => {
    it('should extract version from yarn.lock', async () => {
      const result = await getVersionFromYarnLock(fixturesDir)
      expect(result).toBe('1.52.0')
    })

    it('should return undefined when file missing', async () => {
      const result = await getVersionFromYarnLock('/tmp/non-existent-dir')
      expect(result).toBeUndefined()
    })
  })
})
