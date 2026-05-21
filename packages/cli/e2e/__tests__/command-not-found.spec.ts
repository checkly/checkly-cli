import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('command-not-found', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('points users to the docs and skills command for unknown commands', async () => {
    try {
      await runCheckly(fixt, ['does-not-exist'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).toBe(127)
        expect(err.stderr).toContain('does-not-exist is not a checkly command')
        expect(err.stderr).toContain('https://www.checklyhq.com/docs/cli/')
        expect(err.stderr).toContain('checkly skills')
        expect(err.stderr).toContain('checkly help')
      } else {
        throw err
      }
    }
  })
})
