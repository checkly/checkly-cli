# Account Management

Understand your account's plan, entitlements, and limits.

## Plan-aware workflow

Checkly accounts have different capabilities depending on the plan (Hobby, Starter, Team, Enterprise) and add-ons (Communicate, Resolve). Features like locations, retry strategies, frequencies, and alert channels vary by plan.

**Before writing or modifying checks, run:**

```bash
npx checkly account plan --output json
```

This returns your entitlements (enabled/disabled with limits), available locations, and upgrade URLs. Use this to:

- **Filter locations** to only those where `available` is `true` in `locations.all`
- **Check feature flags** before using constructs (e.g. private locations, advanced alert channels)
- **Respect metered limits** (e.g. max browser checks, max alert channels)
- **Surface upgrade paths** when a feature is disabled — each disabled entitlement includes an `upgradeUrl` pointing to the self-service checkout or the contact sales page

## Available Commands

Parse and read further reference documentation for any of the following:

<!-- REFERENCE_COMMANDS -->
