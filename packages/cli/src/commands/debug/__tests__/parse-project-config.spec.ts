import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../../testing/fixture-sandbox.js'
import { ParseProjectOutput } from '../parse-project.js'

const DEFAULT_FIXT_TIMEOUT = 180_000

describe('debug parse-project config handling', () => {
  describe('invalid config', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'parse-project-fixtures', 'invalid-config'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('emits the machine-readable diagnostics shape with a null payload', async () => {
      const result = await fixt.run('pnpm', ['checkly', 'debug', 'parse-project'])

      expect(result.exitCode).toBe(0)

      const output: ParseProjectOutput = JSON.parse(result.stdout)
      expect(output.payload).toBeNull()
      expect(output.diagnostics.fatal).toBe(true)
      expect(output.diagnostics.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining('Missing required property'),
          fatal: true,
        }),
        expect.objectContaining({
          title: expect.stringContaining('Invalid property value'),
          fatal: true,
        }),
      ]))
    })
  })

  describe('missing config', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'parse-project-fixtures', 'missing-config'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('fails with a non-zero exit code', async () => {
      // fixt.run() rejects on a non-zero exit; the execa error carries the
      // exit code and output. An unexpected success resolves with exit code
      // 0 and fails the assertion below.
      const result = await fixt.run('pnpm', ['checkly', 'debug', 'parse-project'])
        .catch((err: any) => err)

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain('Unable to detect a Checkly configuration file')
    })
  })
})
