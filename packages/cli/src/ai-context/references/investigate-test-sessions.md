# Investigating Test Sessions

Use this flow when a user asks you to run a session, inspect recorded test-session results, investigate test-session error groups, run root cause analysis, or retrieve result logs, traces, videos, screenshots, and other assets.

Read-only inspection commands execute immediately. `rca run` starts a new analysis, but it does not mutate checks or monitors.

## Run or trigger a recorded session

`checkly test`, `checkly trigger`, and `checkly pw-test` record results as a test session by default. Use `--no-record` only when the user explicitly does not want a recorded session.

```bash
npx checkly test --detach --test-session-name "Checkout regression"
npx checkly test --record --detach --test-session-name "Checkout regression"
npx checkly trigger --detach --tags production --test-session-name "Production smoke"
npx checkly pw-test --detach --test-session-name "Playwright suite"
```

For agent workflows, prefer `--detach` when starting recorded sessions. The command schedules the session, prints the `Test session ID`, and exits without waiting for completion. Inspect the session with `npx checkly test-sessions get <test-session-id> --watch` instead of relying on Checkly UI links.

Useful flags:
- `--location <region>` or `--private-location <slug>` - choose where checks run.
- `-e, --env KEY=value` or `--env-file <path>` - pass runtime environment variables.
- `--timeout <seconds>` - wait for session completion before the command exits; ignored when `--detach` exits after scheduling.
- `-d, --detach` - start the session in the cloud, print the test session ID, and exit immediately; preferred for agents starting recorded sessions.

Do not combine `--detach` with file reporters such as `--reporter json` or `--reporter github`. Detached runs exit before results are available, so no result report can be written. After scheduling with `--detach`, use `test-sessions get --output json` for machine-readable session details.

If the command output includes a test session ID or link, use the ID directly with `test-sessions get`.

## Find a test session

```bash
npx checkly test-sessions list
npx checkly test-sessions list --status failed --limit 10
npx checkly test-sessions list --branch main --provider github
npx checkly test-sessions list --search "checkout"
npx checkly test-sessions list --error-group <test-session-error-group-id>
npx checkly test-sessions list --output json
```

Flags:
- `-l, --limit <n>` - number of sessions to return (1-100, default 20).
- `--cursor <nextId>` - fetch the next cursor page.
- `--from <date>` / `--to <date>` - filter by ISO date or Unix timestamp in seconds.
- `--status <status>` - `running`, `failed`, `passed`, or `cancelled`; repeat or comma-separate.
- `--provider <provider>` - `github`, `vercel`, `api`, `trigger`, or `pw_reporter`; repeat or comma-separate.
- `--branch <name>` - filter by Git branch; repeat or comma-separate.
- `--user <id>` and `--no-users` - filter by commit owner/invoking user, or include sessions without either.
- `-s, --search <text>` - search test-session text fields.
- `--error-group <id>` - find sessions that include a specific test-session error group.
- `-o, --output <format>` - `table` (default), `json`, or `md`.

JSON output uses the stable list envelope:

```json
{
  "data": [],
  "pagination": {
    "nextId": null,
    "length": 0
  }
}
```

## Inspect a test session

```bash
npx checkly test-sessions get <test-session-id>
npx checkly test-sessions get <test-session-id> --watch
npx checkly test-sessions get <test-session-id> --output json
npx checkly test-sessions get <test-session-id> --error-groups-limit 20
```

Flags:
- `-w, --watch` - wait for a running session to complete before rendering.
- `--error-groups-limit <n>` - number of error group IDs to show in detail output (default 5).
- `-o, --output <format>` - `detail` (default), `json`, or `md`.

The detail view shows the session status, metadata, result rows, test-session result IDs, check IDs when available, and test-session error group IDs. Prefer `--watch` before investigating failures so you do not act on partial results.

Use `--output json` when you need exact fields, result links, check IDs, or test-session result IDs. For downloadable logs, traces, videos, screenshots, reports, and files, use `checkly assets list` and `checkly assets download` with the test session ID and result ID.

## Inspect a test-session error group

Use only error group IDs shown by `test-sessions get`. Test-session error groups are separate from check error groups, so do not pass them to `checks get --error-group`.

```bash
npx checkly test-sessions get <test-session-id> --error-group <test-session-error-group-id>
npx checkly test-sessions get <test-session-id> --error-group <test-session-error-group-id> --full-error
npx checkly test-sessions get <test-session-id> --error-group <test-session-error-group-id> --output json
```

Flags:
- `--full-error` - print the complete raw error for the selected test-session error group.
- `-w, --watch` - wait for session completion before validating and fetching the error group.
- `-o, --output <format>` - `detail` (default), `json`, or `md`.

Look for `rootCauseAnalyses` in JSON output. If one already exists, reuse it before starting a new RCA.

## Run root cause analysis

For test-session error groups, use `--test-session-error-group` (short alias `-te`). For regular check error groups, use `--error-group` (short alias `-e`).

```bash
npx checkly rca run --test-session-error-group <test-session-error-group-id> --watch
npx checkly rca run -te <test-session-error-group-id> --user-context "Started after checkout deploy" --watch
npx checkly rca get <rca-id> --watch
```

Flags:
- `--user-context <text>` - add concise context that can improve the analysis.
- `-w, --watch` - wait for completion and print the analysis.
- `-o, --output <format>` - `detail` (default), `json`, or `md`; watch mode is only supported with detail output.

If RCA is unavailable because of plan or entitlement limits, run `npx checkly account plan --output json` and report the relevant entitlement or upgrade URL.

## Retrieve result assets

Use the asset manifest commands for recorded test-session result files. Start
from `test-sessions get` to identify the `testSessionResultId` (and `checkId`
when available) for the row you want to inspect.

```bash
npx checkly test-sessions get <test-session-id> --output json
npx checkly assets list --test-session-id <test-session-id> --result-id <test-session-result-id>
npx checkly assets list --test-session-id <test-session-id> --result-id <test-session-result-id> --type trace --view tree
npx checkly assets list --test-session-id <test-session-id> --result-id <test-session-result-id> --output json
npx checkly assets download --test-session-id <test-session-id> --result-id <test-session-result-id> --asset "<Asset>"
npx checkly assets download --test-session-id <test-session-id> --result-id <test-session-result-id> --type all --dir ./checkly-assets
```

Run `assets list` first to discover available files. The default table output
has an `Asset` column; copy that value into `--asset` for single-file downloads.

Flags:
- `--type <type>` - filter/select by `log`, `trace`, `video`, `screenshot`, `pcap`, `report`, `file`, or `all`.
- `--asset <value>` - exact Asset/Name value or glob. Prefer copying the `Asset` value from `assets list --view table` for single-file downloads.
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

If you also need the scheduled check result view for the same row, and the row
has a `checkId`, use:

```bash
npx checkly checks get <check-id> --result <test-session-result-id>
```

Do not invent asset names or assume every result has the same artifact set. Some
results have screenshots only, some have traces or videos, and some have no
downloadable assets.
