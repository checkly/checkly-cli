import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  pathToPosix,
  isFileSync,
  getPlaywrightVersionFromPackage,
  getAutoIncludes,
} from '../util'
import { PackageManager } from '../check-parser/package-files/package-manager'

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

  describe('getAutoIncludes()', () => {
    let tmpDir: string

    const makePm = (name: string): PackageManager => ({
      name,
      representativeLockfile: undefined,
      representativeConfigFile: undefined,
      installCommand: () => ({ executable: name, args: ['install'], unsafeDisplayCommand: `${name} install` }),
      execCommand: (args: string[]) => ({ executable: name, args, unsafeDisplayCommand: `${name} ${args.join(' ')}` }),
      lookupWorkspace: () => Promise.resolve(undefined),
      detector: () => ({}) as any,
    })

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkly-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should return patches/** when pnpm and patches dir exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'patches'))
      const result = getAutoIncludes(tmpDir, makePm('pnpm'), [])
      expect(result).toEqual(['patches/**'])
    })

    it('should return empty when pnpm but no patches dir', () => {
      const result = getAutoIncludes(tmpDir, makePm('pnpm'), [])
      expect(result).toEqual([])
    })

    it('should return empty for npm even with patches dir', () => {
      fs.mkdirSync(path.join(tmpDir, 'patches'))
      const result = getAutoIncludes(tmpDir, makePm('npm'), [])
      expect(result).toEqual([])
    })

    it('should return empty for yarn even with patches dir', () => {
      fs.mkdirSync(path.join(tmpDir, 'patches'))
      const result = getAutoIncludes(tmpDir, makePm('yarn'), [])
      expect(result).toEqual([])
    })

    it('should skip when user already includes patches/**', () => {
      fs.mkdirSync(path.join(tmpDir, 'patches'))
      const result = getAutoIncludes(tmpDir, makePm('pnpm'), ['patches/**'])
      expect(result).toEqual([])
    })

    it('should skip when user already includes a patches/ subpath', () => {
      fs.mkdirSync(path.join(tmpDir, 'patches'))
      const result = getAutoIncludes(tmpDir, makePm('pnpm'), ['patches/some-patch.patch'])
      expect(result).toEqual([])
    })
  })

  describe('getPlaywrightVersionFromPackage()', () => {
    it('should throw error when playwright package is not found', async () => {
      // Use a directory that doesn't have playwright installed
      const nonExistentDir = '/tmp/non-existent-dir'
      await expect(getPlaywrightVersionFromPackage(nonExistentDir))
        .rejects.toThrow('Could not find @playwright/test package. Make sure it is installed.')
    })

    it('should get version from installed playwright package', async () => {
      // Use the current working directory which should have playwright installed
      const currentDir = process.cwd()
      const version = await getPlaywrightVersionFromPackage(currentDir)

      // Should return a valid semver version
      expect(version).toMatch(/^\d+\.\d+\.\d+/)
    })
  })
})
