import path from 'node:path'

import { describe, test, expect } from 'vitest'

import { File } from '../parser'
import { FixtureSandbox } from '../../../testing/fixture-sandbox'

describe('project parser - getFilesAndDependencies()', () => {
  test('should handle spec file', async () => {
    const fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project'),
    })

    try {
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
    } finally {
      await fixt.destroy()
    }
  }, 30_000)

  test('should handle a spec file with snapshots', async () => {
    const fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'check-parser-fixtures', 'playwright-project-snapshots'),
    })

    try {
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
    } finally {
      await fixt.destroy()
    }
  }, 30_000)
})
