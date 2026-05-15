import path from 'node:path'

import * as uuid from 'uuid'
import { ExecaError } from 'execa'
import { describe, expect, beforeAll, afterAll, test } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('trigger', () => {
  let fixt: FixtureSandbox
  const executionId = uuid.v4()

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'trigger-project'),
      template: 'bare',
    })
    await runCheckly(fixt, ['deploy', '--force'], {
      env: { EXECUTION_ID: executionId },
    })
  }, 180_000)

  afterAll(async () => {
    try {
      await runCheckly(fixt, ['destroy', '--force'], {
        env: { EXECUTION_ID: executionId },
      })
    } catch {
      // cleanup best-effort
    }
    await fixt?.destroy()
  })

  test('Should run checks successfully', async () => {
    const secretEnv = uuid.v4()
    const { stdout } = await runCheckly(fixt, [
      'trigger',
      '-e',
      `SECRET_ENV=${secretEnv}`,
      '--verbose',
      '--tags',
      `production,backend,${executionId}`,
      '--tags',
      `production,frontend,${executionId}`,
    ])

    expect(stdout).toContain(secretEnv)
    expect(stdout).toContain('Prod Backend Check')
    expect(stdout).toContain('Prod Frontend Check')
    expect(stdout).not.toContain('Staging Backend Check')
  }, 45_000)

  test('Should return code 1 when no checks match', async () => {
    try {
      await runCheckly(fixt, [
        'trigger',
        '--tags',
        'no-checks-match-this-tag',
      ])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.stdout).toContain('No matching checks were found.')
        expect(err.exitCode).toBe(1)
      } else {
        throw err
      }
    }
  })

  test('Should return code 1 when no checks match and the fail-on-no-matching flag is set', async () => {
    try {
      await runCheckly(fixt, [
        'trigger',
        '--tags',
        'no-checks-match-this-tag',
        '--fail-on-no-matching',
      ])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.stdout).toContain('No matching checks were found.')
        expect(err.exitCode).toBe(1)
      } else {
        throw err
      }
    }
  })

  test('Should return code 0 when no checks match and the no-fail-on-no-matching flag is set', async () => {
    const { stdout } = await runCheckly(fixt, [
      'trigger',
      '--tags',
      'no-checks-match-this-tag',
      '--no-fail-on-no-matching',
    ])

    expect(stdout).toContain('No matching checks were found.')
  })
})
