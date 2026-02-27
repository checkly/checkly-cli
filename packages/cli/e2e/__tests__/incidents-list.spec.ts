import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('checkly incidents list', () => {
  it('should list incidents with default output', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    expect(Array.isArray(parsed.data)).toBe(true)
    expect(parsed).toHaveProperty('count')
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'all', '--output', 'md'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should filter by open status by default', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    for (const incident of parsed.data) {
      expect(incident.lastUpdateStatus).not.toBe('RESOLVED')
    }
  })

  it('should filter by resolved status', async () => {
    const result = await runChecklyCli({
      args: ['incidents', 'list', '--status', 'resolved', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('data')
    for (const incident of parsed.data) {
      expect(incident.lastUpdateStatus).toBe('RESOLVED')
    }
  })
})
