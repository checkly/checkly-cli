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
npx checkly api /v1/checks -X GET -f limit=5 --paginate
```

Key flags: `-X` (method), `-f` (string field), `-F` (typed/JSON field), `-H` (header), `--jq` (filter with jq), `--input` (body from file/stdin), `--paginate`, `--verbose`.

See the [Checkly API reference](https://www.checklyhq.com/docs/api) for available endpoints.

<!-- SKILL_COMMANDS -->
