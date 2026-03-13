import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('checkly checks stats', () => {
  it('should show stats with default output', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
    expect(result.stdout).toContain('STATS')
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
    expect(parsed).toHaveProperty('range')
    expect(parsed).toHaveProperty('pagination')
    expect(parsed.data.length).toBeGreaterThan(0)
    expect(parsed.data[0]).toHaveProperty('checkId')
    expect(parsed.data[0]).toHaveProperty('availability')
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--output', 'md'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('| Name | Type | Status |')
  })

  it('should respect --limit flag', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--output', 'json', '--limit', '1'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.data).toHaveLength(1)
    expect(parsed.pagination.limit).toBe(1)
  })

  it('should respect --range flag', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--output', 'json', '--range', 'last7Days'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.range).toBe('last7Days')
  })

  it('should return no results for impossible search filter', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--search', 'zzz-nonexistent-check-name-zzz'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No checks found.')
  })

  it('should return empty JSON for impossible search filter with --output json', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'stats', '--search', 'zzz-nonexistent-check-name-zzz', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.data).toEqual([])
    expect(parsed.pagination.total).toBe(0)
  })
})
