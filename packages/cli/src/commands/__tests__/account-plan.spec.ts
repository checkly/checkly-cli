import { describe, expect, it } from 'vitest'
import { withUpgradeUrl } from '../account/plan.js'
import type { Entitlement } from '../../rest/entitlements.js'

const unavailableEntitlement: Entitlement = {
  key: 'AGENTIC_CHECKS',
  name: 'Agentic Checks',
  description: 'Legacy AI-powered checks',
  type: 'metered',
  enabled: false,
}

const upgradeableEntitlement: Entitlement = {
  ...unavailableEntitlement,
  key: 'PRIVATE_LOCATIONS',
  requiredPlan: 'TEAM',
}

describe('account plan JSON entitlements', () => {
  it('omits upgradeUrl when the API does not provide an upgrade path', () => {
    expect(withUpgradeUrl(unavailableEntitlement, 'https://example.com')).not.toHaveProperty('upgradeUrl')
  })

  it('adds upgradeUrl when the API provides a required plan or add-on', () => {
    expect(withUpgradeUrl(upgradeableEntitlement, 'https://example.com')).toMatchObject({
      upgradeUrl: 'https://example.com',
    })
  })
})
