# Environment Variables

Checks execute on Checkly's cloud infrastructure, not on the user's machine. Two sources of values are exposed at runtime: built-in variables Checkly injects, and user-defined variables managed in the project, group, check, or globally via the CLI.

## Built-in: Available in All Check Types

Entries with no value are stripped.

| Variable | Description |
| --- | --- |
| `CHECK_ID` | UUID of the check. |
| `CHECK_NAME` | Name of the check. |
| `CHECK_TYPE` | `BROWSER`, `MULTISTEP`, `API`, `PLAYWRIGHT`, etc. |
| `CHECK_RUN_ID` | ID of the run. Format varies by check type (UUID for Playwright Check Suites, numeric ID for browser/multistep). |
| `CHECK_RESULT_ID` | UUID of the result record. |
| `ACCOUNT_ID` | UUID of the Checkly account. |
| `REQUEST_URL` | The check's request URL (mainly relevant for API checks). |
| `GROUP_BASE_URL` | Base URL of the check's group, if any. |
| `CLIENT_CERTIFICATE` | Client cert if configured. |
| `ENVIRONMENT_NAME` | Deployment environment name. Set only for CI/CD-triggered runs. |
| `DEPLOYMENT_ID` | Deployment UUID. Set only for CI/CD-triggered runs. |

## Built-in: Browser Checks, MultiStep Checks, API Setup/Teardown

In addition to the variables above:

| Variable | Description |
| --- | --- |
| `REGION` | AWS region of the runner. |
| `RUNTIME_VERSION` | Runtime version string (e.g. `2025.04`). |
| `PUBLIC_IP_V4` | Public IPv4 of the runner. Value has a trailing newline — call `.trim()` before using. |
| `PUBLIC_IP_V6` | Public IPv6 of the runner. Value has a trailing newline — call `.trim()` before using. |

## Built-in: Playwright Check Suites

In addition to the variables in the first table:

| Variable | Description |
| --- | --- |
| `CHECKLY` | Always `1`. Cleanest "am I running on Checkly?" signal. |
| `CHECKLY_CHECK_ID` | UUID of the check. Mirrors `CHECK_ID`. |
| `CHECKLY_REGION` | Region where the run executes. |
| `CHECKLY_RUN_SOURCE` | What triggered the run (CLI deploy, deployment, group run, manual schedule, scheduler, test, API). |
| `CI` | `1` for CLI runs (`npx checkly test`, `npx checkly trigger`) and deployment-triggered runs. |

Docs: https://www.checklyhq.com/docs/detect/synthetic-monitoring/playwright-checks/environment-variables/

## User-Defined Variables

User-defined variables live at three scopes. Precedence: **check overrides group overrides global**.

- **Global** — available to every check and alert channel in the account. Managed in the UI or via `npx checkly env *`.
- **Group** — scoped to a check group and all its checks. Defined on the `CheckGroupV2` construct.
- **Check** — scoped to a single check. Defined on the construct.

### Variables vs. Secrets

- **Variables** are plaintext: visible in the UI, on result pages, in logs, and exportable via CLI / API.
- **Secrets** are encrypted at rest and never visible after creation — not in the UI, not in logs, not retrievable via CLI or API. Secrets require runtime `2024.09` or later (`3.3.4+` for Private Locations, CLI `4.9.0+`).
- **Locked** variables are encrypted at rest and restricted to Read & Write, Admin, or Owner roles.

Docs: https://www.checklyhq.com/docs/platform/variables/

## Reference Syntax

How to read a variable depends on the context:

| Context | Syntax |
| --- | --- |
| Browser checks, MultiStep checks, API setup/teardown scripts | `process.env.MY_VAR` |
| API check requests (URL, headers, body, query params, basic auth) | `{{MY_VAR}}` |
| API check requests where URI encoding is unwanted | `{{{MY_VAR}}}` |
| Webhook alert channel payloads | `{{MY_VAR}}` |

## Managing Global Variables via the CLI

`npx checkly env` manages **global** account variables. Group- and check-level variables are managed via the UI or directly on the construct.

| Command | Description |
| --- | --- |
| `npx checkly env add <key> <value> [--locked\|-l] [--secret\|-s]` | Create a variable. |
| `npx checkly env update <key> <value> [--locked\|-l] [--secret\|-s]` | Update an existing variable. |
| `npx checkly env ls` | List all account variables; secrets are masked. |
| `npx checkly env pull [filename] [--force\|-f]` | Export to a local file (default `.env`). |
| `npx checkly env rm <key> [--force\|-f]` | Delete a variable. |

Docs: https://www.checklyhq.com/docs/cli/checkly-env/

## Common Use

- Gate behavior between local runs and Checkly cloud by checking `process.env.CHECK_ID` (set for every check type).
- Differentiate retry counts, reporter output, or fixture loading by environment without defining a custom env var.
