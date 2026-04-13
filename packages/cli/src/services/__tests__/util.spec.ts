import path from 'node:path'
import { describe, it, expect } from 'vitest'

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
    const basePath = path.resolve('/project')
    const makePm = (name: string): PackageManager => ({
      name,
      representativeLockfiles: [],
      representativeConfigFile: undefined,
      installCommand: () => ({ executable: name, args: ['install'], unsafeDisplayCommand: `${name} install` }),
      execCommand: (args: string[]) => ({ executable: name, args, unsafeDisplayCommand: `${name} ${args.join(' ')}` }),
      lookupWorkspace: () => Promise.resolve(undefined),
      detector: () => ({}) as any,
    })

    it('should return patches/*.patch for pnpm', () => {
      const result = getAutoIncludes(basePath, makePm('pnpm'), [])
      expect(result).toEqual(['patches/*.patch'])
    })

    it('should return empty for npm', () => {
      const result = getAutoIncludes(basePath, makePm('npm'), [])
      expect(result).toEqual([])
    })

    it('should return empty for yarn', () => {
      const result = getAutoIncludes(basePath, makePm('yarn'), [])
      expect(result).toEqual([])
    })

    it('should skip when user already includes patches/*.patch', () => {
      const result = getAutoIncludes(basePath, makePm('pnpm'), ['patches/*.patch'])
      expect(result).toEqual([])
    })

    it('should skip when user already includes a patches/ subpath', () => {
      const result = getAutoIncludes(basePath, makePm('pnpm'), ['patches/some-patch.patch'])
      expect(result).toEqual([])
    })

    it('should skip when user includes ./patches/**', () => {
      const result = getAutoIncludes(basePath, makePm('pnpm'), ['./patches/**'])
      expect(result).toEqual([])
    })

    it('should skip when user includes absolute patches path', () => {
      const result = getAutoIncludes(basePath, makePm('pnpm'), [path.join(basePath, 'patches/**')])
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
