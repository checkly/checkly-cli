# Inspecting Checks

List and inspect deployed checks in your Checkly account.

## List checks

```bash
npx checkly checks list
npx checkly checks list --tag production --type PLAYWRIGHT
npx checkly checks list --search "Homepage" --output json
```

Flags:
- `--tag <tag>` — filter by tag
- `--type <type>` — filter by check type (`API`, `BROWSER`, `PLAYWRIGHT`, `MULTI_STEP`)
- `--search <name>` — filter by name
- `-o, --output <format>` — `table` (default), `json`, or `md`

## Get check details

```bash
npx checkly checks get <check-id>
npx checkly checks get <check-id> --output json
```

Shows check configuration, recent results, and error groups.

### View a specific check result

```bash
npx checkly checks get <check-id> --result <result-id>
```

### View an error group

```bash
npx checkly checks get <check-id> --error-group <error-group-id>
```

## Check analytics and stats

```bash
npx checkly checks stats
npx checkly checks stats --range last7Days --tag production
npx checkly checks stats <check-id-1> <check-id-2>
npx checkly checks stats --output json
```

Shows availability, response times, error counts, and other metrics for your checks.

Flags:
- `-r, --range <range>` — time range: `last24Hours` (default), `last7Days`, `thisWeek`, `lastWeek`, `lastMonth`
- `-t, --tag <tag>` — filter by tag (repeat for multiple)
- `--type <type>` — filter by check type
- `-s, --search <name>` — filter by name
- `-l, --limit <n>` — max checks to return (1-100, default 25)
- `-p, --page <n>` — page number
- `-o, --output <format>` — `table` (default), `json`, or `md`

Pass one or more check IDs as positional arguments to get stats for specific checks only.

## Trigger checks

```bash
npx checkly trigger --tags production
npx checkly trigger --tags critical,api
```

Triggers existing deployed checks by tag. Useful for on-demand verification.
