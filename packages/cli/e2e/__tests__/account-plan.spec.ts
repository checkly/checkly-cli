import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

describe('checkly account plan', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should show plan summary with default output', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan'])
    expect(stdout).toContain('Plan:')
    expect(stdout).toContain('Metered entitlements')
    expect(stdout).toContain('additional features enabled')
  })

  it('should output valid JSON with --output json', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--output', 'json'])
    const parsed = JSON.parse(stdout)
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
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--output', 'md'])
    expect(stdout).toContain('# Plan:')
    expect(stdout).toContain('| Name | Limit |')
  })

  it('should show detail view for a specific entitlement key', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', 'BROWSER_CHECKS'])
    expect(stdout).toContain('BROWSER_CHECKS')
    expect(stdout).toContain('Browser checks')
  })

  it('should output single entitlement as JSON', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', 'BROWSER_CHECKS', '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.key).toBe('BROWSER_CHECKS')
    expect(parsed.type).toBe('metered')
  })

  it('should filter by --type metered', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--type', 'metered'])
    expect(stdout).toContain('LIMIT')
    expect(stdout).toContain('entitlement')
  })

  it('should filter by --type flag', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--type', 'flag'])
    expect(stdout).toContain('ENABLED')
    expect(stdout).toContain('entitlement')
  })

  it('should filter by --search', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--search', 'browser'])
    expect(stdout).toContain('Browser')
    expect(stdout).toContain('entitlement')
  })

  it('should fail for unknown entitlement key', async () => {
    try {
      await runCheckly(fixt, ['account', 'plan', 'NONEXISTENT_KEY'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).toBe(2)
        expect(err.stderr).toContain('not found')
      } else {
        throw err
      }
    }
  })

  it('should fail when combining key with --type', async () => {
    try {
      await runCheckly(fixt, ['account', 'plan', 'BROWSER_CHECKS', '--type', 'metered'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
      } else {
        throw err
      }
    }
  })

  it('should show REQUIRED UPGRADE column in summary view', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan'])
    expect(stdout).toContain('REQUIRED UPGRADE')
  })

  it('should show billing checkout link', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan'])
    expect(stdout).toContain('billing/checkout')
  })

  it('should include checkoutUrl and contactSalesUrl in JSON output', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--output', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty('checkoutUrl')
    expect(parsed.checkoutUrl).toContain('billing/checkout')
    expect(parsed).toHaveProperty('contactSalesUrl')
    expect(parsed.contactSalesUrl).toContain('contact-sales')
  })

  it('should filter with --disabled flag', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--disabled'])
    expect(stdout).toContain('entitlement')
  })

  it('should combine --disabled with --type', async () => {
    const { stdout } = await runCheckly(fixt, ['account', 'plan', '--disabled', '--type', 'flag'])
    expect(stdout).toContain('REQUIRED UPGRADE')
  })

  it('should fail when combining key with --disabled', async () => {
    try {
      await runCheckly(fixt, ['account', 'plan', 'BROWSER_CHECKS', '--disabled'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
      } else {
        throw err
      }
    }
  })
})
