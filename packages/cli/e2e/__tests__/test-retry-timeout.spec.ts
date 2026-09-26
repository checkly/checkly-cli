import path from 'node:path'

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { ExecaError } from 'execa'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { checklyEnv } from '../run-checkly'

/**
 * The per-check timeout must measure time since the last sign of life from a
 * check (run-start, retry attempt), not the whole retry sequence. The fixture
 * check waits 8s and fails on every attempt; with 3 retries the run takes
 * roughly 40s to 60s. Against a 30s --timeout the old runner reported
 * "Reached timeout" halfway through and dropped the remaining attempts.
 */
describe('test --retries with a small --timeout', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'retry-timeout-project'),
      template: 'playwright',
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('lets a retrying check finish and shows the retry count', async () => {
    expect.assertions(4)
    try {
      await fixt.run('pnpm', ['checkly', 'test', '--retries=3', '--timeout=30'], {
        timeout: 170_000,
        env: checklyEnv(),
      })
    } catch (err) {
      if (!(err instanceof ExecaError)) {
        throw err
      }
      const stdout = err.stdout as unknown as string
      // The check failed for real (exit code 1), not because the CLI gave up.
      expect(err.exitCode).toBe(1)
      expect(stdout).not.toContain('Reached timeout')
      // The initial run plus three retries all reported back.
      expect(stdout.match(/Failing Check Result/g)).toHaveLength(4)
      // The final title keeps the retries visible.
      expect(stdout).toContain('(3 retries)')
    }
  }, 180_000)
})
