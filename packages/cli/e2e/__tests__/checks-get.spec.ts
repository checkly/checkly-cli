import config from 'config'
import { describe, it, expect, beforeAll } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('checkly checks get', () => {
  let checkId: string

  beforeAll(async () => {
    const result = await runChecklyCli({
      args: ['checks', 'list', '--output', 'json', '--limit', '1'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.data.length).toBeGreaterThan(0)
    checkId = parsed.data[0].id
  })

  it('should get check detail with default output', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'get', checkId],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'get', checkId, '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.check.id).toBe(checkId)
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'get', checkId, '--output', 'md'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('| Field | Value |')
  })

  it('should fail for nonexistent check ID', async () => {
    const result = await runChecklyCli({
      args: ['checks', 'get', 'nonexistent-check-id-00000'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).not.toBe(0)
  })
})
