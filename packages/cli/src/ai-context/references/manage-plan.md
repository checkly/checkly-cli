# Account Plan and Entitlements

Show your account plan, entitlements, feature limits, and available locations.

## Usage

```bash
npx checkly account plan                          # Summary view (metered limits + flag count)
npx checkly account plan --output json             # Full JSON (recommended for agents)
npx checkly account plan --disabled                # Show only features not on your plan
npx checkly account plan --disabled --type flag    # Disabled flags only
npx checkly account plan --type metered            # Metered limits only
npx checkly account plan --search "browser"        # Search by name or description
npx checkly account plan BROWSER_CHECKS            # Detail view for one entitlement
npx checkly account plan --help                    # Full flag reference
```

## JSON response shape (abbreviated)

```json
{
  "plan": "hobby",
  "planDisplayName": "Hobby",
  "checkoutUrl": "https://app.checklyhq.com/accounts/.../billing/checkout",
  "contactSalesUrl": "https://www.checklyhq.com/contact-sales/",
  "locations": {
    "all": [
      { "id": "us-east-1", "name": "N. Virginia", "available": true },
      { "id": "eu-west-1", "name": "Ireland", "available": false }
    ],
    "maxPerCheck": 3
  },
  "entitlements": [
    { "key": "BROWSER_CHECKS", "type": "metered", "enabled": true, "quantity": 10 },
    {
      "key": "PRIVATE_LOCATIONS", "type": "metered", "enabled": false,
      "requiredPlan": "TEAM", "requiredPlanDisplayName": "Team",
      "upgradeUrl": "https://app.checklyhq.com/accounts/.../billing/checkout"
    }
  ]
}
```

## How to use this data

1. **Locations:** Filter `locations.all` to entries where `available === true`. Use only those IDs in `checkly.config.ts` and check constructs. Respect `maxPerCheck` as the upper bound per check.
2. **Metered entitlements:** Check `quantity` for limits. `enabled: false` means the feature is not available.
3. **Flag entitlements:** `enabled: true` means available, `false` means not on this plan.
4. **Disabled features:** Each includes an `upgradeUrl`. Share this with the user — it points to the self-service checkout page or the enterprise contact sales page depending on the required plan.
