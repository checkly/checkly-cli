import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('checkly checks list', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should list checks with default output', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list'])
    expect(stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
  })

  it('should output markdown with --output md', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'md'])
    expect(stdout).toContain('| Name | Description | Type | Status |')
  })

  it('should respect --limit flag', async () => {
    const { stdout: allStdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'json'])
    const allParsed = JSON.parse(allStdout)
    expect(allParsed.data.length).toBeGreaterThan(1)

    const { stdout: limitedStdout } = await runCheckly(fixt, ['checks', 'list', '--output', 'json', '--limit', '1'])
    const limitedParsed = JSON.parse(limitedStdout)
    expect(limitedParsed.data).toHaveLength(1)
  })
})
