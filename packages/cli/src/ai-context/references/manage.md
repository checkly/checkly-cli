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

## Applying entitlements to check configuration

Entitlement keys follow the pattern `{CHECK_TYPE}_{FEATURE}` — match them to the check type you're configuring. Before setting any property on a check construct, find the corresponding entitlement and verify it's enabled.

**Common plan-gated properties that agents get wrong on first setup:**

| Check property | Entitlement pattern to search | What to do if disabled |
|---|---|---|
| `retryStrategy` | `*_RETRY_STRATEGY_*` and `*_MAX_RETRIES_*` for your check type | Omit `retryStrategy` entirely, or use only `NO_RETRIES` |
| `runParallel` | `*_SCHEDULING_STRATEGY_PARALLEL` for your check type | Omit `runParallel` or set to `false` (use round-robin) |
| `frequency` | `*_FREQ_*` for your check type | Use only frequencies where the entitlement is enabled |
| `locations` | `locations.all` array | Use only locations where `available` is `true` |
| `privateLocation` | `PRIVATE_LOCATIONS` | Only available on Team plan and above |

**How to check:** Use `--search` to narrow entitlements for the check type you're configuring:

```bash
npx checkly account plan --output json --search "uptime"
npx checkly account plan --disabled --search "retry"
```

**When a feature is disabled:** Do not use it. Omit the property from the construct — Checkly will apply safe defaults. If the user needs the feature, share the `upgradeUrl` from the entitlement.

## Available Commands

Parse and read further reference documentation for any of the following:

<!-- REFERENCE_COMMANDS -->
