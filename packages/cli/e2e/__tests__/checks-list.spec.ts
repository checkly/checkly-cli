import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('checkly checks list', () => {
  it('should list checks with default output', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--output', 'md'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('| Name | Type | Status |')
  })

  it('should respect --limit flag', async () => {
    const allResult = await runChecklyCli({
      args: ['checks', 'list', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(allResult.status).toBe(0)
    const allParsed = JSON.parse(allResult.stdout)
    expect(allParsed.data.length).toBeGreaterThan(1)

    const limitedResult = await runChecklyCli({
      args: ['checks', 'list', '--output', 'json', '--limit', '1'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(limitedResult.status).toBe(0)
    const limitedParsed = JSON.parse(limitedResult.stdout)
    expect(limitedParsed.data).toHaveLength(1)
  })
})
