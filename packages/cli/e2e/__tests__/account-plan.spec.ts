import config from 'config'
import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('checkly account plan', () => {
  it('should show plan summary with default output', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Plan:')
    expect(result.stdout).toContain('Metered entitlements')
    expect(result.stdout).toContain('additional features enabled')
  })

  it('should output valid JSON with --output json', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toHaveProperty('plan')
    expect(parsed).toHaveProperty('planDisplayName')
    expect(parsed).toHaveProperty('addons')
    expect(parsed).toHaveProperty('entitlements')
    expect(Array.isArray(parsed.entitlements)).toBe(true)
    expect(parsed.entitlements.length).toBeGreaterThan(0)
    expect(parsed.entitlements[0]).toHaveProperty('key')
    expect(parsed.entitlements[0]).toHaveProperty('type')
    expect(parsed.entitlements[0]).toHaveProperty('enabled')
  })

  it('should output markdown with --output md', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', '--output', 'md'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('# Plan:')
    expect(result.stdout).toContain('| Name | Limit |')
  })

  it('should show detail view for a specific entitlement key', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', 'BROWSER_CHECKS'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('BROWSER_CHECKS')
    expect(result.stdout).toContain('Browser checks')
  })

  it('should output single entitlement as JSON', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', 'BROWSER_CHECKS', '--output', 'json'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.key).toBe('BROWSER_CHECKS')
    expect(parsed.type).toBe('metered')
  })

  it('should filter by --type metered', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', '--type', 'metered'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('LIMIT')
    expect(result.stdout).toContain('entitlement')
  })

  it('should filter by --type flag', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', '--type', 'flag'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ENABLED')
    expect(result.stdout).toContain('entitlement')
  })

  it('should filter by --search', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', '--search', 'browser'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Browser')
    expect(result.stdout).toContain('entitlement')
  })

  it('should fail for unknown entitlement key', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', 'NONEXISTENT_KEY'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('not found')
  })

  it('should fail when combining key with --type', async () => {
    const result = await runChecklyCli({
      args: ['account', 'plan', 'BROWSER_CHECKS', '--type', 'metered'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
    })
    expect(result.status).not.toBe(0)
  })
})
