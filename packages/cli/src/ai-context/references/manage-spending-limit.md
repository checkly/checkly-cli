# Spending Limit

Show and manage the account's overage spending limit: the most the account may spend on runs beyond what the plan includes. When overage reaches the limit, checks stop running.

## Usage

```bash
npx checkly account spending-limit                       # Limit, overage so far, whether checks are stopped
npx checkly account spending-limit --output json         # Raw API response (recommended for agents)
npx checkly account spending-limit set 50                # Set or change the limit, in US dollars
npx checkly account spending-limit set 12.50 --dry-run   # Preview the change without applying it
npx checkly account spending-limit remove --force        # Remove the limit (overage is no longer capped)
```

- `set <dollars>` takes 0 to 10000 with at most 2 decimals. `0` allows no overage at all.
- `set` and `remove` require confirmation. In non-interactive mode, review the confirmation preview and rerun with `--force`. Do not change the limit unless the user asked for it: lowering it to or below the overage so far stops checks at once.
- Plans that cannot hold a limit (e.g. prepaid or contract plans) are rejected.

## JSON response shape

```json
{
  "spendingCapCents": 3000,
  "standing": {
    "measuredAt": "2026-11-15T00:00:00.000Z",
    "pools": {
      "API": { "used": 17230, "included": 100000, "overageRuns": 0, "overageCents": 0 },
      "BROWSER": { "used": 14890, "included": 12000, "overageRuns": 2890, "overageCents": 1806.25 }
    },
    "overageCents": 1806.25,
    "limit": { "capCents": 3000, "state": "CLOSE", "closeAtCents": 2400 }
  }
}
```

- Amounts are in US cents. `spendingCapCents: null` means no limit.
- `standing: null` means overage is not measured (runs not measured yet, or the plan has no overage). It does not mean $0 overage.
- Checks are stopped when `standing.limit.state` is `REACHED`.
