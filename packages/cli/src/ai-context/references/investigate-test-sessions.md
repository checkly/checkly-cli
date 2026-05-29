# Investigating Test Sessions

Use this flow when a user asks you to run a session, inspect recorded test-session results, investigate test-session error groups, run root cause analysis, or retrieve result logs, traces, videos, screenshots, and other assets.

Read-only inspection commands execute immediately. `rca run` starts a new analysis, but it does not mutate checks or monitors.

## Run or trigger a recorded session

`checkly test`, `checkly trigger`, and `checkly pw-test` record results as a test session by default. Use `--no-record` only when the user explicitly does not want a recorded session.

```bash
npx checkly test --test-session-name "Checkout regression"
npx checkly test --record --test-session-name "Checkout regression"
npx checkly trigger --tags production --test-session-name "Production smoke"
npx checkly pw-test --test-session-name "Playwright suite"
```

Useful flags:
- `--location <region>` or `--private-location <slug>` - choose where checks run.
- `-e, --env KEY=value` or `--env-file <path>` - pass runtime environment variables.
- `--timeout <seconds>` - wait for session completion before the command exits.
- `-d, --detach` - keep cloud execution running if the local CLI is cancelled.
- `-r, --reporter json` - capture machine-readable run output, including test session IDs when available.

If the command output includes a test session ID or link, use it directly with `test-sessions get`.

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

Use `--output json` when you need exact fields, result links, or asset URLs. For Playwright Check Suite results, inspect result payload fields such as Playwright result details, traces, videos, screenshots, reports, and links when present.

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

There is no dedicated `test-sessions download` command. Use the JSON outputs and links exposed by the session or result payload.

```bash
npx checkly test-sessions get <test-session-id> --output json
npx checkly checks get <check-id> --result <test-session-result-id> --output json
```

Use `test-sessions get --output json` first. If a result includes public URLs or asset fields, download those URLs directly. If a result only gives `checkId` plus `testSessionResultId`, use `checks get <check-id> --result <test-session-result-id> --output json` to fetch detailed result data; terminal output summarizes available screenshots, traces, and videos, while JSON output exposes the underlying URLs/fields.

Do not invent asset names or assume every result has the same artifact set. Some results have screenshots only, some have traces or videos, and some have no downloadable assets.
