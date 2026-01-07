import path from 'node:path'
import fs from 'node:fs/promises'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extract } from 'tar'

import {
  pathToPosix,
  isFileSync,
  getPlaywrightVersionFromPackage,
  bundlePlayWrightProject,
} from '../util'
import { Session } from '../../constructs/project'
import { Err, Ok } from '../check-parser/package-files/result'
import { Package, Workspace } from '../check-parser/package-files/workspace'
import { usingIsolatedFixture } from '../check-parser/__tests__/helper'

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

  describe('bundlePlayWrightProject()', () => {
    async function usingFixture (
      handle: ({ fixtureDir, extractDir }: { fixtureDir: string, extractDir: string }) => Promise<void>,
    ) {
      await usingIsolatedFixture(path.join(__dirname, 'fixtures', 'playwright-bundle-test'), async fixtureDir => {
        const extractDir = await fs.mkdtemp(`${fixtureDir}-extracted`)

        try {
          Session.workspace = Ok(new Workspace({
            root: new Package({
              name: 'playwright-bundle-test',
              path: fixtureDir,
            }),
            packages: [],
            lockfile: Ok(path.join(fixtureDir, 'package-lock.json')),
            configFile: Err(new Error('configFile not set')),
          }))

          Session.basePath = fixtureDir
          Session.contextPath = fixtureDir

          await handle({
            fixtureDir,
            extractDir,
          })
        } finally {
          Session.reset()

          // Clean up extraction directory
          try {
            await fs.rm(extractDir, { recursive: true, force: true })
          } catch {
            // Ignore cleanup errors
          }
        }
      })
    }

    it('should exclude directories matching ignoreDirectoriesMatch pattern', async () => {
      await usingFixture(async ({ fixtureDir, extractDir }) => {
        const playwrightConfigPath = path.join(fixtureDir, 'playwright.config.ts')

        // Set ignoreDirectoriesMatch to exclude fixtures directory
        Session.ignoreDirectoriesMatch = ['**/fixtures/**']

        // Bundle the project
        const result = await bundlePlayWrightProject(playwrightConfigPath, [])

        // Extract the bundle
        await extract({
          file: result.outputFile,
          cwd: extractDir,
        })

        // Check that test files are included
        const testsDir = path.join(extractDir, 'tests')
        const testFiles = await fs.readdir(testsDir)
        expect(testFiles).toContain('example.spec.ts')

        // Check that fixtures directory is NOT included
        const fixturesPath = path.join(extractDir, 'fixtures')
        await expect(fs.access(fixturesPath)).rejects.toThrow()
      })
    }, 30000)

    it('should include all directories when ignoreDirectoriesMatch is empty', async () => {
      await usingFixture(async ({ fixtureDir, extractDir }) => {
        const playwrightConfigPath = path.join(fixtureDir, 'playwright.config.ts')

        // Set empty ignoreDirectoriesMatch
        Session.ignoreDirectoriesMatch = []

        // Bundle the project with include pattern that matches fixtures
        const result = await bundlePlayWrightProject(playwrightConfigPath, ['fixtures/**/*'])

        // Extract the bundle
        await extract({
          file: result.outputFile,
          cwd: extractDir,
        })

        // Check that fixtures directory IS included when explicitly in include
        const fixturesPath = path.join(extractDir, 'fixtures')
        const fixturesExists = await fs.access(fixturesPath).then(() => true).catch(() => false)
        expect(fixturesExists).toBe(true)

        if (fixturesExists) {
          const fixtureFiles = await fs.readdir(fixturesPath)
          expect(fixtureFiles).toContain('mock-data.json')
        }
      })
    }, 30000)

    it('should include explicit node_modules patterns bypassing default ignores', async () => {
      await usingFixture(async ({ fixtureDir, extractDir }) => {
        const playwrightConfigPath = path.join(fixtureDir, 'playwright.config.ts')

        // Set empty ignoreDirectoriesMatch
        Session.ignoreDirectoriesMatch = []

        // Bundle the project with explicit node_modules pattern
        const result = await bundlePlayWrightProject(playwrightConfigPath, ['node_modules/@internal/test-helpers/**'])

        // Extract the bundle
        await extract({
          file: result.outputFile,
          cwd: extractDir,
        })

        // Check that node_modules directory IS included when explicitly specified
        const nodeModulesPath = path.join(extractDir, 'node_modules', '@internal', 'test-helpers')
        const nodeModulesExists = await fs.access(nodeModulesPath).then(() => true).catch(() => false)
        expect(nodeModulesExists).toBe(true)

        if (nodeModulesExists) {
          const helperFiles = await fs.readdir(nodeModulesPath)
          expect(helperFiles).toContain('helper.js')
        }
      })
    }, 30000)

    it('should still respect custom ignoreDirectoriesMatch for explicit patterns', async () => {
      await usingFixture(async ({ fixtureDir, extractDir }) => {
        const playwrightConfigPath = path.join(fixtureDir, 'playwright.config.ts')

        // Set custom ignoreDirectoriesMatch to exclude @internal
        Session.ignoreDirectoriesMatch = ['**/@internal/**']

        // Bundle the project with explicit node_modules pattern
        const result = await bundlePlayWrightProject(playwrightConfigPath, ['node_modules/@internal/test-helpers/**'])

        // Extract the bundle
        await extract({
          file: result.outputFile,
          cwd: extractDir,
        })

        // Check that @internal is NOT included (custom ignore still applies)
        const nodeModulesPath = path.join(extractDir, 'node_modules', '@internal')
        await expect(fs.access(nodeModulesPath)).rejects.toThrow()
      })
    }, 30000)

    it('should exclude node_modules with broad patterns despite include', async () => {
      await usingFixture(async ({ fixtureDir, extractDir }) => {
        const playwrightConfigPath = path.join(fixtureDir, 'playwright.config.ts')

        // Set empty ignoreDirectoriesMatch
        Session.ignoreDirectoriesMatch = []

        // Bundle with a broad pattern that would match node_modules but doesn't explicitly target it
        const result = await bundlePlayWrightProject(playwrightConfigPath, ['**/*.js'])

        // Extract the bundle
        await extract({
          file: result.outputFile,
          cwd: extractDir,
        })

        // Check that node_modules is NOT included (default ignore still applies for broad patterns)
        const nodeModulesPath = path.join(extractDir, 'node_modules')
        await expect(fs.access(nodeModulesPath)).rejects.toThrow()
      })
    }, 30000)
  })
})
