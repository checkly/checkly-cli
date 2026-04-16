---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with Agentic Checks, API Checks, Browser Checks, URL Monitors, ICMP Monitors, Playwright Check Suites, Heartbeat Monitors, Alert Channels, Dashboards, or Status Pages.
allowed-tools: Bash(npx:checkly:*) Bash(npm:install:*)
metadata:
  author: checkly
---

# Checkly

The Checkly CLI provides all the required information via the `npx checkly skills` command.

Use `npx checkly skills install` to install this skill into your project (supports Claude Code, Cursor, Codex and more).

Use `npx checkly skills` to list all available actions, and `npx checkly skills <action>` to access up-to-date information on how to use the Checkly CLI for each action.

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

When deploying, use `--verbose` to include resource names and physical IDs (UUIDs) in the output. This is useful for programmatically referencing deployed resources (e.g. running `npx checkly checks get <id>` to inspect a deployed check).

Run `npx checkly skills communicate` for the full protocol details.

### `npx checkly skills initialize`
Learn how to initialize and set up a new Checkly CLI project from scratch.

### `npx checkly skills configure`
Learn how to create and manage monitoring checks using Checkly constructs and the CLI.

#### `npx checkly skills configure agentic-checks`
Agentic Check construct (`AgenticCheck`) for AI-powered prompt-driven monitoring with skill and env var allowlists

#### `npx checkly skills configure api-checks`
Api Check construct (`ApiCheck`), assertions, and authentication setup scripts

#### `npx checkly skills configure browser-checks`
Browser Check construct (`BrowserCheck`) with Playwright test files

#### `npx checkly skills configure playwright-checks`
Playwright Check Suite construct (`PlaywrightCheck`) for multi-browser test suites

#### `npx checkly skills configure multistep-checks`
Multistep Check construct (`MultiStepCheck`) for complex user flows

#### `npx checkly skills configure tcp-monitors`
TCP Monitor construct (`TcpMonitor`) with assertions

#### `npx checkly skills configure url-monitors`
URL Monitor construct (`UrlMonitor`) with assertions

#### `npx checkly skills configure dns-monitors`
DNS Monitor construct (`DnsMonitor`) with assertions

#### `npx checkly skills configure icmp-monitors`
ICMP Monitor construct (`IcmpMonitor`) with latency and packet loss assertions

#### `npx checkly skills configure heartbeat-monitors`
Heartbeat Monitor construct (`HeartbeatMonitor`)

#### `npx checkly skills configure check-groups`
CheckGroupV2 construct (`CheckGroupV2`) for organizing checks

#### `npx checkly skills configure alert-channels`
Email (`EmailAlertChannel`), Phone (`PhoneCallAlertChannel`), and Slack (`SlackAlertChannel`) alert channels

#### `npx checkly skills configure supporting-constructs`
Status pages (`StatusPage`), dashboards (`Dashboard`), maintenance windows (`MaintenanceWindow`), and private locations (`PrivateLocation`)

### `npx checkly skills investigate`
Access check status, analyze failures, and investigate errors.

#### `npx checkly skills investigate checks`
Inspecting checks (`checks list`, `checks get`) and triggering on-demand runs

### `npx checkly skills communicate`
Open incidents and lead customer communications via status pages.

#### `npx checkly skills communicate incidents`
Incident lifecycle (`incidents create`, `update`, `resolve`, `list`) and status pages

### `npx checkly skills manage`
Understand your account plan, entitlements, and feature limits.

#### `npx checkly skills manage plan`
Check account plan, entitlements, feature limits, and available locations (`account plan`)
