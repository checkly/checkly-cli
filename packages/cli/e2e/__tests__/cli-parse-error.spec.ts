import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('cli parse error', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('hints at the skills command on unknown flags', async () => {
    try {
      await runCheckly(fixt, ['checks', 'list', '--does-not-exist'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
        expect(err.stderr).toContain('Nonexistent flag: --does-not-exist')
        expect(err.stderr).toContain('checkly skills')
      } else {
        throw err
      }
    }
  })

  it('hints at the skills command on invalid flag values', async () => {
    try {
      await runCheckly(fixt, ['checks', 'list', '--output', 'bogus'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
        expect(err.stderr).toContain('checkly skills')
      } else {
        throw err
      }
    }
  })
})
