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

  // Input a command rejects itself, before any API call, exits with the
  // usage-error code like oclif's own parse errors.
  it.each([
    ['a malformed api field', ['api', '/v1/checks', '-F', 'broken'], 'Invalid field format'],
    ['a custom flag parse failure', ['deploy', '--schedule-on-deploy-threshold', 'abc'],
      'Expected a non-negative whole number or "auto"'],
    ['an unsupported import resource type', ['import', 'plan', 'bogus:1'], 'Unsupported resource type'],
  ])('exits 2 for %s', async (_, args, message) => {
    try {
      await runCheckly(fixt, args)
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).toBe(2)
        expect(err.stderr).toContain(message)
      } else {
        throw err
      }
    }
  })
})
