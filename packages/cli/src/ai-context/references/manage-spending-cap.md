# Spending Cap

Show and manage the account's overage spending cap: the most the account may spend on runs beyond what the plan includes. When overage reaches the cap, checks stop running.

## Usage

```bash
npx checkly account spending-cap                       # Cap, overage so far, whether checks are stopped
npx checkly account spending-cap --output json         # Raw API response (recommended for agents)
npx checkly account spending-cap set 50                # Set or change the cap, in US dollars
npx checkly account spending-cap set 12.50 --dry-run   # Preview the change without applying it
npx checkly account spending-cap remove --force        # Remove the cap (overage is no longer capped)
```

- `set <dollars>` takes 0 to 10000 with at most 2 decimals. `0` allows no overage at all.
- `set` and `remove` require confirmation. In non-interactive mode, review the confirmation preview and rerun with `--force`. Do not change the cap unless the user asked for it: lowering it to or below the overage so far stops checks at once.
- Plans that cannot hold a cap (e.g. prepaid or contract plans) are rejected.
- Needs a user or service API key; legacy account API keys are rejected (401).

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

- Amounts are in US cents. `spendingCapCents: null` means no cap.
- `standing: null` means overage is not measured (runs not measured yet, or the plan has no overage). It does not mean $0 overage.
- Checks are stopped when `standing.limit.state` is `REACHED`.
