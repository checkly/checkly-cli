---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with Agentic Checks, API Checks, Browser Checks, URL Monitors, ICMP Monitors, Playwright Check Suites, Heartbeat Monitors, Alert Channels, Dashboards, or Status Pages. Access Checkly account plan, entitlements and feature limits.
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

### `npx checkly skills initialize`
Learn how to initialize and set up a new Checkly CLI project from scratch.

### `npx checkly skills configure`
Learn how to create and manage monitoring checks using Checkly constructs and the CLI.

### `npx checkly skills investigate`
Access check status, analyze failures, and investigate errors.

### `npx checkly skills communicate`
Open incidents and lead customer communications via status pages.

### `npx checkly skills manage`
Understand your account plan, entitlements, and feature limits.
