import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, test, expect, afterAll, beforeAll } from 'vitest'

import { File } from '../parser.js'
import { FixtureSandbox } from '../../../testing/fixture-sandbox.js'
import { pathToPosix } from '../../util.js'

describe('project parser - getFilesAndDependencies()', { timeout: 45_000 }, () => {
  describe('playwright-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should handle spec file', async () => {
      const result = await fixt.run('pnpm', [
        'checkly',
        'debug',
        'parse-playwright-config',
        '--file',
        fixt.abspath('playwright.config.ts'),
      ])

      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.error('stderr', result.stderr)
        // eslint-disable-next-line no-console
        console.error('stdout', result.stdout)
      }

      expect(result.exitCode).toBe(0)

      const output: {
        files: File[]
        errors: string[]
      } = JSON.parse(result.stdout)

      expect(output.files).toEqual(expect.arrayContaining([
        { physical: true, filePath: pathToPosix(fixt.abspath('package.json')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('playwright.config.ts')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('tests', 'example.spec.ts')) },
      ]))
      expect(output.files).toHaveLength(3)
      expect(output.errors).toHaveLength(0)
    })
  })

  describe('playwright-project-snapshots', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project-snapshots'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should handle a spec file with snapshots', async () => {
      const result = await fixt.run('pnpm', [
        'checkly',
        'debug',
        'parse-playwright-config',
        '--file',
        fixt.abspath('playwright.config.ts'),
      ])

      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.error('stderr', result.stderr)
        // eslint-disable-next-line no-console
        console.error('stdout', result.stdout)
      }

      expect(result.exitCode).toBe(0)

      const output: {
        files: File[]
        errors: string[]
      } = JSON.parse(result.stdout)

      expect(output.files).toEqual(expect.arrayContaining([
        { physical: true, filePath: pathToPosix(fixt.abspath('package.json')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('playwright.config.ts')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('tests/example.spec.ts')) },
        { physical: true, filePath: expect.stringContaining('example.spec.ts-snapshots') },
      ]))
      expect(output.files).toHaveLength(4)
      expect(output.errors).toHaveLength(0)
    })
  })

  describe('playwright-symlink-testdir', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-symlink-testdir'),
      })

      // The config's testDir points here. Under pnpm every package in
      // node_modules is a directory symlink like this one, and globbing with a
      // symlinked working directory finds nothing at all — this fixture pins
      // that the paths the config names are resolved through links first.
      await fs.symlink(
        path.join('real', 'tests'),
        path.join(fixt.root, 'linked-tests'),
      )
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should discover files and snapshots through a symlinked testDir, at real paths', async () => {
      const result = await fixt.run('pnpm', [
        'checkly',
        'debug',
        'parse-playwright-config',
        '--file',
        fixt.abspath('playwright.config.ts'),
      ])

      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.error('stderr', result.stderr)
        // eslint-disable-next-line no-console
        console.error('stdout', result.stdout)
      }

      expect(result.exitCode).toBe(0)

      const output: {
        files: File[]
        errors: string[]
      } = JSON.parse(result.stdout)

      // Everything resolves into the one real namespace: the test file and its
      // snapshot appear under real/tests, never under the linked-tests spelling.
      // Snapshot discovery is the sensitive part — its glob patterns mix testDir
      // with the discovered file paths, and a namespace mismatch silently
      // matches nothing.
      expect(output.files).toEqual(expect.arrayContaining([
        { physical: true, filePath: pathToPosix(fixt.abspath('package.json')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('playwright.config.ts')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('real', 'tests', 'example.spec.ts')) },
        {
          physical: true,
          // The full real path, deliberately: an assertion that merely contains
          // the -snapshots suffix would also match the through-link spelling,
          // which is the namespace mix this fixture exists to rule out.
          filePath: pathToPosix(fixt.abspath(
            'real', 'tests', 'example.spec.ts-snapshots', 'Google-test-1-Mobile-Chrome-linux.png',
          )),
        },
      ]))
      expect(output.files).toHaveLength(4)
      expect(output.errors).toHaveLength(0)
    })
  })

  describe('playwright-deep-symlink-testdir', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-deep-symlink-testdir'),
      })

      // testDir points *through* this link into a subdirectory of the target —
      // the shape a pnpm workspace produces when a config's testDir reaches
      // into a linked package (node_modules/@scope/pkg/src/tests/...). Unlike a
      // testDir that IS a link, globbing here works, but discovers files at the
      // through-link spelling, which is not where they belong in a bundle.
      await fs.symlink(
        path.join('packages', 'tests-pkg'),
        path.join(fixt.root, 'linked-pkg'),
      )
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should discover files at real paths when testDir runs through a symlink', async () => {
      const result = await fixt.run('pnpm', [
        'checkly',
        'debug',
        'parse-playwright-config',
        '--file',
        fixt.abspath('playwright.config.ts'),
      ])

      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.error('stderr', result.stderr)
        // eslint-disable-next-line no-console
        console.error('stdout', result.stdout)
      }

      expect(result.exitCode).toBe(0)

      const output: {
        files: File[]
        errors: string[]
      } = JSON.parse(result.stdout)

      expect(output.files).toEqual(expect.arrayContaining([
        { physical: true, filePath: pathToPosix(fixt.abspath('package.json')) },
        { physical: true, filePath: pathToPosix(fixt.abspath('playwright.config.ts')) },
        {
          physical: true,
          filePath: pathToPosix(fixt.abspath(
            'packages', 'tests-pkg', 'src', 'tests', 'flows', 'checkout.spec.ts',
          )),
        },
      ]))
      // Nothing at the through-link spelling.
      for (const file of output.files) {
        if (file.physical) {
          expect(file.filePath).not.toContain('linked-pkg')
        }
      }
      expect(output.files).toHaveLength(3)
      expect(output.errors).toHaveLength(0)
    })
  })
})
