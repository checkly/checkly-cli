# Inspecting Checks

List and inspect deployed checks in your Checkly account.

## List checks

```bash
npx checkly checks list
npx checkly checks list --tag production --type PLAYWRIGHT
npx checkly checks list --status failing
npx checkly checks list --search "Homepage" --output json
```

Flags:
- `-t, --tag <tag>` — filter by tag (repeat for multiple)
- `--type <type>` — filter by check type (`API`, `BROWSER`, `HEARTBEAT`, `MULTI_STEP`, `PLAYWRIGHT`, `TCP`, `ICMP`, `DNS`, `URL`, `AGENTIC`)
- `-s, --search <name>` — filter by name (case-insensitive partial match)
- `--status <status>` — filter by current status: `passing`, `failing`, or `degraded`
- `-l, --limit <n>` — max checks to return (1-100, default 25)
- `-p, --page <n>` — page number
- `-o, --output <format>` — `table` (default), `json`, or `md`

## Get check details

```bash
npx checkly checks get <check-id>
npx checkly checks get <check-id> --output json
npx checkly checks get <check-id> --stats-range last7Days --group-by location
```

Shows check configuration, recent results, error groups, and analytics stats.

Flags:
- `-r, --result <result-id>` — drill into a specific result (see below)
- `--include-attempts` — with `--result`, also list the individual retry attempts for that result (see below)
- `-e, --error-group <error-group-id>` — show full details for a specific error group
- `--results-limit <n>` — number of recent results to show (default 10)
- `--results-cursor <cursor>` — paginate results using the cursor from previous output
- `--stats-range <range>` — analytics range: `last24Hours` (default), `last7Days`, `last30Days`, `thisWeek`, `thisMonth`, `lastWeek`, `lastMonth`
- `--group-by <dimension>` — group stats by `location` or `statusCode`
- `--metrics <list>` — comma-separated list of metrics to show (overrides defaults)
- `--filter-status <status>` — only include runs with this status in stats: `success` or `failure`
- `-o, --output <format>` — `detail` (default), `json`, or `md`

**Important:** Look for `errorGroups`, `rootCause` or `RCA` to investigate a root cause. If available, let the user know that Rocky AI (Checkly's AI agent) evaluated the issue already and reuse all available information.

### View a specific check result

```bash
npx checkly checks get <check-id> --result <result-id>
npx checkly checks get <check-id> --result <result-id> --output json
```

### View retry attempts for a result

When a check has retries enabled, a single run produces one `FINAL` result plus
one `ATTEMPT` result for each earlier failed try (all sharing a `sequenceId`).
By default only the `FINAL` result is shown. Add `--include-attempts` to list the
full retry sequence — attempt number, status, location, duration, and a short
error summary:

```bash
npx checkly checks get <check-id> --result <result-id> --include-attempts
npx checkly checks get <check-id> --result <result-id> --include-attempts --output json
```

With `--include-attempts --output json`, the command returns a stable envelope:

```json
{
  "result": {},
  "attempts": []
}
```

Use the `attempts` array to inspect intermediate retry failures. Use the `result`
object for the requested result row.

### List or download result assets

Result detail output summarizes available screenshots, traces, and videos when
present. Use the dedicated asset manifest commands to inspect exact asset names
and download files:

```bash
npx checkly assets list --check-id <check-id> --result-id <result-id>
npx checkly assets list --check-id <check-id> --result-id <result-id> --type trace --view tree
npx checkly assets list --check-id <check-id> --result-id <result-id> --output json
npx checkly assets download --check-id <check-id> --result-id <result-id> --asset "<Asset>"
npx checkly assets download --check-id <check-id> --result-id <result-id> --type all --dir ./checkly-assets
```

Run `assets list` first to discover available files. The default table output
has an `Asset` column; copy that value into `--asset` for single-file downloads.

Flags:
- `--type <type>` - filter/select by `log`, `trace`, `video`, `screenshot`, `pcap`, `report`, `file`, or `all`.
- `--asset <value>` - exact Asset/Name value or glob. Prefer copying the `Asset` value from the default table output before downloading a single file.
- `--dir <path>` - destination directory for downloads; defaults under `./checkly-assets/`.
- `--force` / `--skip-existing` - overwrite or preserve existing files.

`assets list --output json` uses a stable list envelope:

```json
{
  "data": [],
  "pagination": {
    "length": 0
  }
}
```

`assets download` requires `--type` or `--asset` unless the manifest is a single
archive bundle. Archive entries download as their containing archive; filters
narrow the manifest list, not the archive bytes.

Do not invent asset names or assume every result has the same artifact set. Some
results have screenshots only, some have traces or videos, and some have no
downloadable assets.

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
