import path from 'node:path'

import { describe, test, expect, afterAll, beforeAll } from 'vitest'

import { File } from '../parser'
import { FixtureSandbox } from '../../../testing/fixture-sandbox'

describe('project parser - getFilesAndDependencies()', { timeout: 45_000 }, () => {
  describe('playwright-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should handle spec file', async () => {
      const result = await fixt.run('npx', [
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

      expect(output.files).toEqual([
        { physical: true, filePath: fixt.abspath('package.json') },
        { physical: true, filePath: fixt.abspath('playwright.config.ts') },
        { physical: true, filePath: fixt.abspath('tests/example.spec.ts') },
      ])

      expect(output.errors).toHaveLength(0)
    })
  })

  describe('playwright-project-snapshots', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project-snapshots'),
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    test('should handle a spec file with snapshots', async () => {
      const result = await fixt.run('npx', [
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

      expect(output.files).toEqual([
        { physical: true, filePath: fixt.abspath('package.json') },
        { physical: true, filePath: fixt.abspath('playwright.config.ts') },
        { physical: true, filePath: fixt.abspath('tests/example.spec.ts') },
        { physical: true, filePath: fixt.abspath('tests/example.spec.ts-snapshots/Google-test-1-Mobile-Chrome-linux.png') },
      ])

      expect(output.errors).toHaveLength(0)
    })
  })
})
