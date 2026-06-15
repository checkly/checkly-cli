---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with Agentic Checks, API Checks, Browser Checks, URL Monitors, ICMP Monitors, Playwright Check Suites, Heartbeat Monitors, Alert Channels, Dashboards, or Status Pages. Access Checkly account plan, entitlements, feature limits, members, and pending invites. Includes generic API pass-through (`checkly api`) for endpoints without dedicated commands.
allowed-tools: Bash(npx:checkly:*) Bash(npm:install:*)
metadata:
  author: checkly
---

# Checkly

**Required:** Before answering any Checkly question, run `npx checkly skills` to get the current and up-to-date action list. Do not rely on memory or prior context — the CLI is the source of truth and actions might change between releases.

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

Before configuring checks, run `npx checkly account plan --output json` to see what features, locations, and limits are available on the current plan. Disabled features include an `upgradeUrl` pointing to the self-service checkout page or the enterprise contact sales page — share these with the user when they need a feature that's not on their plan.

Run `npx checkly skills manage` for the full reference.

## Confirmation Protocol

Write commands (e.g. `incidents create`, `deploy`, `destroy`) return exit code 2 with a `confirmation_required` JSON envelope instead of executing. **Always present the `changes` to the user and wait for approval before running the `confirmCommand`.** Never auto-append `--force`. This applies to every write command individually — updates and resolutions need confirmation too, not just the initial create.

Run `npx checkly skills communicate` for the full protocol details.

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
