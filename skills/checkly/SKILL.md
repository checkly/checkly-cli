---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with API Checks, Browser Checks, URL Monitors, ICMP Monitors, Playwright Check Suites, Heartbeat Monitors, Alert Channels, Dashboards, or Status Pages. Access Checkly account plan, entitlements, feature limits, members, and pending invites. Includes generic API pass-through (`checkly api`) for endpoints without dedicated commands.
allowed-tools: Bash(npx checkly:*), Bash(npm install:*)
metadata:
  author: checkly
---

# Checkly

## CLI or MCP? Establish your path first

This skill drives the `npx checkly` CLI in a shell. The Checkly MCP server covers a subset — live account work: check status and results, test sessions, root cause analyses (RCA), triggering existing checks, and incidents. Only the CLI can author, test, and deploy Monitoring as Code.

Before your first command that talks to the Checkly API, establish your path:

1. **No shell access** (chat-only session): stop following this skill and use the Checkly MCP tools if they're connected; if not, tell the user you need either a shell or the Checkly MCP server to work with Checkly.
2. **Shell access**: run `npx checkly whoami` once.
   - **Succeeds** → use the CLI for everything and keep following this skill, even when Checkly MCP tools are also connected.
   - **Fails with an auth error, or prints an `action_required` login line** (not logged in) → route by task:
     - *Authoring, testing, or deploying checks*: MCP cannot do this. Log in through the CLI yourself (see "Logging in as an agent" below), or, when the user prefers keys, ask for `CHECKLY_API_KEY` + `CHECKLY_ACCOUNT_ID` in the environment or `.env`. Then re-run `whoami`. Don't work around a missing login.
     - *Live account work* (status, results, test sessions, RCA, triggering, incidents): fall back to the Checkly MCP tools if they're connected; ignore the login code. Call the MCP `whoami` tool first and tell the user which account you're operating on. If MCP isn't connected either, ask the user to authenticate the CLI as above.

Two rules that survive any fallback:

- **Account parity.** CLI auth and the MCP session can point at different accounts — users often belong to several. Never mix CLI and MCP results in one task without confirming both use the same account ID, and always name the account after a fallback.
- **Writes still need confirmation.** The CLI's confirmation protocol (below) does not travel with you to MCP. If you fall back for a write action (e.g. creating an incident), present the intended change and get the user's approval before calling the tool.

## Logging in as an agent

`npx checkly login` needs no terminal, and any command that requires authentication starts it for you when no credentials are stored, so you rarely run it by hand. It prints one JSON line and exits; when another command started it, the line goes to stderr. Relay what it says; never guess:

- `{"status":"action_required","reason":"login_required","verification_uri_complete":…,"user_code":…,"expires_in":…}` — a human must approve. Give the user the URL and the code (valid for `expires_in` seconds). Users without a Checkly account can sign up on the same page. Once they say they are done, run the same command again: it picks up the approval. (When another command started the login, run that command again; it picks up the approval and does its work.) Running it earlier shows the code again (or a new one when the old one is about to expire); always relay the latest `user_code`. Until the login is done, don't run several Checkly commands in parallel.
  - If the line has a `verification_uri` but no `user_code`, the URL must be opened on the same machine as the CLI, and the command waits for it instead of exiting: run it in the background so you can relay the URL.
  - If it has no URL and its `next` has no `when`, run that command now, in the background, relay what it prints, and run the original command again once the user is done (running it earlier only repeats this line).
- `{"status":"action_required","reason":"select_account","choices":[…],"next":[…]}` — the key is stored, but the user belongs to several accounts. Ask the user which one (or use an id they already gave you) and run `npx checkly login --account-id <id>`. Never pick one yourself, even if you cannot ask: stop and say which accounts are available. There is no second browser step. The same command switches accounts later.
- `{"status":"success","reason":…,"message":…,"accountId":…,"accountName":…}` — done. Tell the user which account you are on.
- `{"status":"error","reason":…,"message":…}` — report the message; do not retry in a loop. `reason` is one of `access_denied`, `expired_token`, `code_used` (run the login again for a new code), `account_not_found`, `no_accounts`, `invalid_response`, `network_error` (the login server could not be reached), `api_error`, `env_credentials` (credentials are set in the environment; the user must remove them to log in) or `login_failed`. To log in as a different user, run `npx checkly logout` first.

On a host without a browser set `CHECKLY_NO_BROWSER=1` so the CLI does not try to open one; the URL and code are printed regardless. The flag forms are `--account-id` and `--no-browser`.

## Always load the current action list first

**Required:** Before answering any Checkly question, run `npx checkly skills` to get the current and up-to-date action list. Do not rely on memory or prior context — the CLI is the source of truth and actions might change between releases. `npx checkly skills` runs locally — it needs no authentication or API access, so it works before you've established your path above.

Then run `npx checkly skills <action>` to load up-to-date details for the action you need.

Use `npx checkly skills install` to install this skill into your project (supports Claude Code, Cursor, Codex and more).

For recorded test-session investigations, run `npx checkly skills investigate test-sessions`.

## Progressive Disclosure via `npx checkly skills`

The skill is structured for efficient context usage:

1. **Metadata** (~80 tokens): Name and description in frontmatter
2. **Core Instructions** (~1K tokens): Main SKILL.md content with links to reference commands
3. **Reference Commands** (loaded on demand): Detailed construct documentation with examples

Agents load what they need for each task.

## Plan Awareness

Before configuring checks, run `npx checkly account plan --output json` to see what features, locations, and limits are available on the current plan. A disabled entitlement may include an `upgradeUrl` for self-service checkout or enterprise contact sales. Share it only when present; otherwise the entitlement is unavailable.

Run `npx checkly skills manage` for the full reference.

## Confirmation Protocol

Write commands (e.g. `incidents create`, `deploy`, `destroy`) return exit code 2 with a `confirmation_required` JSON envelope instead of executing. **Always present the `changes` to the user and wait for approval before running the `confirmCommand`.** This applies to every write command individually — updates and resolutions need confirmation too, not just the initial create. The one exception is a `checkly deploy --plan` whose plan has no changes: there is nothing to approve, so it prints `No changes.`, records the deployment, schedules the checks unless `--no-schedule-on-deploy` is passed or there are more of them than the scheduling threshold allows (`--schedule-on-deploy-threshold`, by default set by Checkly), leaving out the checks that run more often than the minimum frequency for deploys (`--schedule-on-deploy-min-frequency`, by default set by Checkly), and exits with code 0.

The `confirmCommand` is the approved command, ready to run verbatim: it starts with `npx checkly` so the project's own CLI runs, repeats the flags you passed and already ends in `--force`. Run it as-is once the user approves — don't add `--force` to a command yourself, don't drop the `npx`, and don't add flags the user didn't ask for.

Run `npx checkly skills communicate` for the full protocol details, or `npx checkly skills configure` for what `deploy` confirms.

## API Pass-Through (fallback for any endpoint)

When no dedicated CLI command exists for an endpoint, use `npx checkly api` to make authenticated requests directly. The CLI handles auth headers and base URL automatically.

```bash
npx checkly api /v1/checks
npx checkly api /v1/dashboards -X GET --jq '.[].name'
npx checkly api /v1/checks -X POST -F name=MyCheck -F activated:=true
npx checkly api /v1/checks -X GET -F limit=5
```

Key flags: `-X` (method), `-F` (field — `key=value` for strings, `key:=value` for JSON), `-H` (header), `--jq` (filter with jq), `--input` (body from file/stdin), `-i` / `--include` (response status + headers on stdout), `--verbose` (request/response headers on stderr).

### Nested payloads

Use `:=` to send structured JSON in a single field:

```bash
npx checkly api /v1/checks/<id> -X PATCH \
  -F retryStrategy:='{"type":"LINEAR","maxRetries":2,"baseBackoffSeconds":10}'
```

For large or deeply nested bodies, pipe a JSON file via `--input`:

```bash
npx checkly api /v1/checks -X POST --input ./new-check.json
```

### Pagination

`checkly api` does not auto-walk pages. Drive pagination yourself, the same way every other `checkly` list command exposes it.

When using `-F` on a read endpoint, **always pass `-X GET` explicitly** — any `-F` flag implies POST unless the method is set, so omitting `-X GET` will try to create a resource with your pagination params as the body.

**Detecting which pagination style an endpoint uses.** Make a first request with `-i` (response headers on stdout) and inspect what came back:

- **Page-based** → response has a `content-range` header (e.g. `0-1/23` means items 0–1 of 23 total) and usually a `link` header with `rel="next"` / `rel="last"`. The body is a bare array. Walk by incrementing `-F page=N` until you've covered the total in `content-range`, or until the `rel="next"` link disappears.
- **Cursor-based** → response body is an envelope like `{ entries: [...], nextId: "...", length: N }`. Pass `-F nextId=<value>` (or `-F cursor=<value>`, depending on the endpoint) on the next call. When `nextId` is missing or null, you've reached the end.

```bash
# Step 1: make the first call with -i and inspect the response shape
npx checkly api /v1/checks -X GET -F limit=100 -i

# If you saw a content-range header → page-based, walk with -F page=N
npx checkly api /v1/checks -X GET -F limit=100 -F page=2 -i

# If the body had a nextId field → cursor-based, walk with -F nextId=<value>
npx checkly api /v1/status-pages -X GET -F limit=50 -F nextId=<nextIdFromPrevResponse>
```

### Error responses

On non-2xx, the response body is still written to stdout (read it for the API's error message) and the CLI exits with code 1. A 401 prints an auth hint, a 403 prints a permission hint, and a 404 prints the docs URL — all on stderr.

### Endpoint discovery

See the [Checkly API reference](https://www.checklyhq.com/docs/api) for the human-readable endpoint catalogue, or fetch the [OpenAPI spec](https://api.checklyhq.com/openapi.json) for a machine-readable definition you can grep for paths, parameters, and response shapes.

### `npx checkly skills initialize`
Learn how to initialize and set up a new Checkly CLI project from scratch.

### `npx checkly skills configure`
Learn how to create and manage monitoring checks using Checkly constructs and the CLI.

### `npx checkly skills investigate`
Access check and test-session status, analyze failures, inspect attempts/assets, and investigate errors.

### `npx checkly skills communicate`
Open incidents and lead customer communications via status pages.

### `npx checkly skills manage`
Understand your account plan, entitlements, feature limits, members, and pending invites.
