import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../render'
import {
  formatUpgradePath,
  formatLocations,
  formatPlanHeader,
  formatPlanSummary,
  formatEntitlementDetail,
  formatFilteredEntitlements,
} from '../account-plan'
import {
  enabledFlag,
  disabledFlagPlanOnly,
  disabledFlagAddonOnly,
  disabledFlagBothPlanAndAddon,
  disabledFlagNoUpgradeData,
  hobbyPlan,
  planWithoutLocations,
} from './__fixtures__/account-plan-fixtures'

describe('formatUpgradePath', () => {
  it('returns null for enabled entitlements', () => {
    expect(formatUpgradePath(enabledFlag)).toBeNull()
  })

  it('returns null for disabled entitlements with no upgrade data', () => {
    expect(formatUpgradePath(disabledFlagNoUpgradeData)).toBeNull()
  })

  it('returns plan name for plan-only upgrade', () => {
    expect(formatUpgradePath(disabledFlagPlanOnly)).toBe('Team plan')
  })

  it('returns addon string for addon-only upgrade', () => {
    expect(formatUpgradePath(disabledFlagAddonOnly)).toBe('Communicate Starter add-on')
  })

  it('returns combined string for plan + addon upgrade', () => {
    expect(formatUpgradePath(disabledFlagBothPlanAndAddon)).toBe('Starter plan + Communicate Starter add-on')
  })

  it('falls back to title-cased key when display name is missing', () => {
    const entitlement = {
      ...disabledFlagPlanOnly,
      requiredPlanDisplayName: undefined,
    }
    expect(formatUpgradePath(entitlement)).toBe('Team plan')
  })
})

describe('formatLocations', () => {
  it('returns location summary with available names', () => {
    const result = formatLocations(hobbyPlan.locations!, 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('3 of 5 available')
    expect(plain).toContain('max 3 per check')
    expect(plain).toContain('N. Virginia')
    expect(plain).toContain('Frankfurt')
    expect(plain).toContain('Singapore')
    expect(plain).not.toContain('Ohio')
  })

  it('handles zero available locations', () => {
    const noneAvailable = {
      all: [
        { id: 'us-east-1', name: 'N. Virginia', available: false },
      ],
      maxPerCheck: 3,
    }
    const result = formatLocations(noneAvailable, 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('0 of 1 available')
    expect(plain).not.toContain('N. Virginia')
  })

  it('omits individual names when all locations are available', () => {
    const allAvailable = {
      all: [
        { id: 'us-east-1', name: 'N. Virginia', available: true },
        { id: 'eu-central-1', name: 'Frankfurt', available: true },
      ],
      maxPerCheck: 6,
    }
    const result = formatLocations(allAvailable, 'terminal')
    const plain = stripAnsi(result)
    expect(plain).toContain('2 of 2 available')
    expect(plain).not.toContain('N. Virginia')
  })
})

describe('formatPlanHeader', () => {
  it('includes billing link', () => {
    const result = formatPlanHeader(hobbyPlan, 'terminal', 'https://app.checklyhq.com/accounts/abc123/billing/checkout')
    const plain = stripAnsi(result)
    expect(plain).toContain('Plan:')
    expect(plain).toContain('Hobby')
    expect(plain).toContain('https://app.checklyhq.com/accounts/abc123/billing/checkout')
  })

  it('includes locations when present', () => {
    const result = formatPlanHeader(hobbyPlan, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('Locations:')
    expect(plain).toContain('3 of 5 available')
  })

  it('omits locations when not present', () => {
    const result = formatPlanHeader(planWithoutLocations, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).not.toContain('Locations:')
  })
})

describe('formatPlanSummary', () => {
  it('includes REQUIRED UPGRADE column in metered table', () => {
    const result = formatPlanSummary(hobbyPlan, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('REQUIRED UPGRADE')
    expect(plain).toContain('Team plan')
  })

  it('mentions --disabled in hint text', () => {
    const result = formatPlanSummary(hobbyPlan, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('--disabled')
  })
})

describe('formatEntitlementDetail', () => {
  it('shows Required Upgrade for disabled entitlement', () => {
    const result = formatEntitlementDetail(hobbyPlan, disabledFlagPlanOnly, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('Required Upgrade:')
    expect(plain).toContain('Team plan')
    expect(plain).toContain('Upgrade Link:')
  })

  it('omits Required Upgrade for enabled entitlement', () => {
    const result = formatEntitlementDetail(hobbyPlan, enabledFlag, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).not.toContain('Required Upgrade:')
    expect(plain).not.toContain('Upgrade Link:')
  })
})

describe('formatFilteredEntitlements', () => {
  it('includes REQUIRED UPGRADE column in flag table', () => {
    const flags = hobbyPlan.entitlements.filter(e => e.type === 'flag')
    const result = formatFilteredEntitlements(hobbyPlan, flags, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('REQUIRED UPGRADE')
    expect(plain).toContain('Team plan')
  })

  it('includes REQUIRED UPGRADE column in metered table', () => {
    const metered = hobbyPlan.entitlements.filter(e => e.type === 'metered')
    const result = formatFilteredEntitlements(hobbyPlan, metered, 'terminal', 'https://example.com')
    const plain = stripAnsi(result)
    expect(plain).toContain('REQUIRED UPGRADE')
  })
})
