import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('checkly checks get', () => {
  let fixt: FixtureSandbox
  let checkId: string

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })

    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'json', '--limit', '1'])
    const parsed = JSON.parse(stdout)
    expect(parsed.data.length).toBeGreaterThan(0)
    checkId = parsed.data[0].id
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should get check detail with default output', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'get', checkId])
    expect(stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'get', checkId, '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.check.id).toBe(checkId)
  })

  it('should output markdown with --output md', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'get', checkId, '--output', 'md'])
    expect(stdout).toContain('| Field | Value |')
  })

  it('should fail for nonexistent check ID', async () => {
    try {
      await runCheckly(fixt, ['checks', 'get', 'nonexistent-check-id-00000'])
      expect.unreachable('Expected command to fail for nonexistent check ID')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
      } else {
        throw err
      }
    }
  })
})
