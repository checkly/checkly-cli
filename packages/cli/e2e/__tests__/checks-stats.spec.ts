import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('checkly checks stats', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should show stats with default output', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats'])
    expect(stdout).toBeTruthy()
    expect(stdout).toContain('STATS')
  })

  it('should output valid JSON with --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
    expect(parsed).toHaveProperty('range')
    expect(parsed).toHaveProperty('pagination')
    expect(parsed.data.length).toBeGreaterThan(0)
    expect(parsed.data[0]).toHaveProperty('checkId')
    expect(parsed.data[0]).toHaveProperty('availability')
  })

  it('should output markdown with --output md', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--output', 'md'])
    expect(stdout).toContain('| Name | Type | Status |')
  })

  it('should respect --limit flag', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--output', 'json', '--limit', '1'])
    const parsed = JSON.parse(stdout)
    expect(parsed.data).toHaveLength(1)
    expect(parsed.pagination.limit).toBe(1)
  })

  it('should respect --range flag', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--output', 'json', '--range', 'last7Days'])
    const parsed = JSON.parse(stdout)
    expect(parsed.range).toBe('last7Days')
  })

  it('should return no results for impossible search filter', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--search', 'zzz-nonexistent-check-name-zzz'])
    expect(stdout).toContain('No checks found.')
  })

  it('should return empty JSON for impossible search filter with --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['checks', 'stats', '--search', 'zzz-nonexistent-check-name-zzz', '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.data).toEqual([])
    expect(parsed.pagination.total).toBe(0)
  })
})
