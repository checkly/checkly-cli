import path from 'node:path'
import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'

import {
  pathToPosix,
  isFileSync,
  getPlaywrightVersionFromPackage,
  findRegexFiles,
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

  describe('findRegexFiles()', () => {
    it('should correctly handle relative directory paths', async () => {
      // Create a temporary directory structure
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-util-'))
      const testSubDir = path.join(tmpDir, 'testdir')
      await fs.mkdir(testSubDir)
      await fs.writeFile(path.join(testSubDir, 'file1.ts'), 'content')
      await fs.writeFile(path.join(testSubDir, 'file2.js'), 'content')

      try {
        // Change to temp directory to test relative paths
        const originalCwd = process.cwd()
        process.chdir(tmpDir)

        // Call with relative directory (no leading ./ or /)
        // findRegexFiles internally uses path.relative, so it needs to resolve the directory
        const files = await findRegexFiles('testdir', /.*/, [])

        // Should get correct relative paths, not paths like ../../absolute/path/...
        expect(files).toContain('file1.ts')
        expect(files).toContain('file2.js')
        expect(files.every(p => !p.startsWith('..'))).toBe(true)

        // Restore original cwd
        process.chdir(originalCwd)
      } finally {
        // Cleanup
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    })
  })
})
