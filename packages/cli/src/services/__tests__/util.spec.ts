import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'

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

  describe('getPlaywrightVersion()', () => {
    const fixturesDir = path.join(__dirname, '..', '__tests__', 'fixtures', 'playwright-json');
    const emptyDir = path.join(__dirname, 'fixtures', 'empty');

    // Create empty directory for testing the "not found" case
    beforeEach(async () => {
      if (!fsSync.existsSync(emptyDir)) {
        await fs.mkdir(emptyDir, { recursive: true });
      }
    });

    afterAll(async () => {
      if (fsSync.existsSync(emptyDir)) {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    })

    it('should find version using node_modules path', async () => {
      const version = await getPlaywrightVersion(fixturesDir);
      expect(version).toBe('1.1.1');
    });

    it('should return undefined if playwright is not found', async () => {
      const version = await getPlaywrightVersion(emptyDir);
      expect(version).toBeUndefined();
    });
  })
})
