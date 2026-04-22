# API response fixtures

Sanitized samples of `/v1/checks` and `/v1/check-statuses` responses, drawn
from a real Checkly production account and scrubbed of account-specific data.
Use via the typed helpers in `./index.ts`:

```ts
import { scenario } from './'

const { checks, statuses } = scenario('all-deactivated')
```

## Contents

- `checks.json` — 19 checks covering a mix of active/deactivated states across
  API, BROWSER, HEARTBEAT, MULTI_STEP, PLAYWRIGHT, AGENTIC check types.
- `check-statuses.json` — 16 statuses (3 of the 19 checks legitimately lack a
  status entry — they're either freshly created or deactivated without a run).

## Scenarios (via `scenario(name)`)

| Name                  | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `mixed`               | Full 19-check fixture. The canonical dataset.          |
| `all-passing`         | 6 active checks, all passing. Healthy-account baseline.|
| `all-deactivated`     | 5 deactivated checks (3 with stale statuses).          |
| `active-no-statuses`  | 1 active check with no status entry. New-check case.   |
| `empty`               | `{ checks: [], statuses: [] }`.                        |

For edge cases not represented in real data (pure `hasErrors`,
deactivated+failing), mutate the returned fixture in the test that needs it.

## Sanitization

The following were remapped or stripped:

- `id` → `check-NNN` (sequential)
- `name` → `"Check NNN"`
- `description` → `null`
- `request.url` → `https://example.com/check-NNN`
- `tags`, `privateLocations` → sequential synthetic names
- `groupId` → sequential small integers
- `created_at` / `updated_at` → synthetic dates starting `2025-01-01`
- `longestRun` / `shortestRun` → rounded to nearest 100ms
- `script`, `environmentVariables`, `alertChannelSubscriptions`,
  `alertSettings`, `localSetupScript`, `localTearDownScript`,
  `setupSnippetId`, `tearDownSnippetId`, `sslCheckDomain` → dropped entirely

Retained as-is (not sensitive):
- `checkType`, `activated`, `muted`
- `frequency`, `frequencyOffset`
- AWS region codes in `locations`
- Public `runtimeId` version strings
- `heartbeat` config on HEARTBEAT checks
- Status booleans (`hasFailures`, `hasErrors`, `isDegraded`) and
  `sslDaysRemaining`

## Empirical API quirks verified at capture time

Documented here because they materially affect how the CLI should treat the
data — they're not obvious from the type declarations.

1. **`/v1/check-statuses` ignores `limit` and `page`** query parameters. It
   always returns all statuses that exist for the account, in one response.
   The `content-range` header can be misleading if those params are passed.

2. **`/v1/check-statuses` includes statuses for deactivated checks.** The
   webapp filters these out client-side when rendering its summary bar; the
   CLI must do the same. This fixture reproduces that: `check-015`, `-016`,
   and `-017` are deactivated but appear in `check-statuses.json`.

3. **Not every check has a status entry.** Brand-new checks that have never
   run are absent from the status response (e.g. `check-013` here).
   Deactivated checks that never ran are also absent.

4. **`/v1/checks?status=X` server filters already exclude deactivated checks**
   — confirmed empirically. No client-side `activated` check is needed when
   applying `status=` to the checks endpoint; only the summary-bar needs
   client-side activated filtering, because the status endpoint isn't
   filter-aware.

5. **Per-type shape varies.** HEARTBEAT checks have no `frequency`,
   `locations`, `privateLocations`, or `groupId`; instead they carry a
   `heartbeat` object with `period`/`periodUnit`/`grace`/`graceUnit`. Other
   types carry `frequency` and `locations`. The declared `Check` interface in
   `packages/cli/src/rest/checks.ts` does not currently reflect this
   divergence — something to be aware of if tests run into missing fields.
