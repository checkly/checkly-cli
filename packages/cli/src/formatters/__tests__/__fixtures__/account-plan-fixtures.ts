import type { Entitlement, AccountPlan } from '../../../rest/entitlements'

// --- Entitlements ---

export const enabledMetered: Entitlement = {
  key: 'BROWSER_CHECKS',
  name: 'Browser checks',
  description: 'Maximum number of browser checks',
  type: 'metered',
  enabled: true,
  quantity: 10,
}

export const disabledMeteredWithUpgrade: Entitlement = {
  key: 'PRIVATE_LOCATIONS',
  name: 'Private locations',
  description: 'Maximum number of private locations',
  type: 'metered',
  enabled: false,
  requiredPlan: 'TEAM',
  requiredPlanDisplayName: 'Team',
}

export const enabledFlag: Entitlement = {
  key: 'SMS_ALERTS',
  name: 'SMS alerts',
  description: 'Receive alert notifications via SMS',
  type: 'flag',
  enabled: true,
}

export const disabledFlagPlanOnly: Entitlement = {
  key: 'ADVANCED_ALERT_CHANNELS',
  name: 'Advanced alert channels',
  description: 'Alert channels like OpsGenie, PagerDuty',
  type: 'flag',
  enabled: false,
  requiredPlan: 'TEAM',
  requiredPlanDisplayName: 'Team',
}

export const disabledFlagAddonOnly: Entitlement = {
  key: 'STATUS_PAGES_BULK_SUBSCRIBE',
  name: 'Status page bulk subscribe',
  description: 'Bulk subscribe contacts to status page notifications',
  type: 'flag',
  enabled: false,
  requiredAddon: {
    name: 'communicate',
    displayName: 'Communicate',
    tier: 'TIER_STARTER',
    tierDisplayName: 'Starter',
  },
}

export const disabledFlagBothPlanAndAddon: Entitlement = {
  key: 'STATUS_PAGES_SLACK_NOTIFICATIONS',
  name: 'Status page Slack notifications',
  description: 'Send status page updates to Slack channels',
  type: 'flag',
  enabled: false,
  requiredPlan: 'STARTER',
  requiredPlanDisplayName: 'Starter',
  requiredAddon: {
    name: 'communicate',
    displayName: 'Communicate',
    tier: 'TIER_STARTER',
    tierDisplayName: 'Starter',
  },
}

export const disabledFlagNoUpgradeData: Entitlement = {
  key: 'DATACENTER_BARE_METAL',
  name: 'Bare metal data centers',
  description: 'Run checks from dedicated bare metal infrastructure',
  type: 'flag',
  enabled: false,
}

// --- Account Plans ---

export const hobbyPlan: AccountPlan = {
  plan: 'hobby',
  planDisplayName: 'Hobby',
  addons: {},
  locations: {
    all: [
      { id: 'us-east-1', name: 'N. Virginia', available: true },
      { id: 'us-east-2', name: 'Ohio', available: false },
      { id: 'eu-central-1', name: 'Frankfurt', available: true },
      { id: 'eu-west-1', name: 'Ireland', available: false },
      { id: 'ap-southeast-1', name: 'Singapore', available: true },
    ],
    maxPerCheck: 3,
  },
  entitlements: [
    enabledMetered,
    disabledMeteredWithUpgrade,
    enabledFlag,
    disabledFlagPlanOnly,
    disabledFlagAddonOnly,
    disabledFlagBothPlanAndAddon,
    disabledFlagNoUpgradeData,
  ],
}

export const teamPlan: AccountPlan = {
  plan: 'team',
  planDisplayName: 'Team',
  addons: {
    communicate: { tier: 'TIER_STARTER', tierDisplayName: 'Communicate Starter' },
  },
  locations: {
    all: [
      { id: 'us-east-1', name: 'N. Virginia', available: true },
      { id: 'eu-central-1', name: 'Frankfurt', available: true },
    ],
    maxPerCheck: 6,
  },
  entitlements: [
    { ...enabledMetered, quantity: 50 },
    {
      ...disabledMeteredWithUpgrade,
      enabled: true,
      quantity: 10,
      requiredPlan: undefined,
      requiredPlanDisplayName: undefined,
    },
    enabledFlag,
    { ...disabledFlagPlanOnly, enabled: true, requiredPlan: undefined, requiredPlanDisplayName: undefined },
  ],
}

export const planWithoutLocations: AccountPlan = {
  plan: 'hobby',
  planDisplayName: 'Hobby',
  addons: {},
  entitlements: [enabledMetered, disabledFlagPlanOnly],
}
