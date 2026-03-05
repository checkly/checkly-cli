---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with API Checks, Browser Checks, URL Monitors, ICMP Monitors, Playwright Check Suites, Heartbeat Monitors, Alert Channels, Dashboards, or Status Pages.
allowed-tools: Bash(npx:checkly:*) Bash(npm:create:checkly@latest) Bash(npm:install:*)
metadata:
  author: checkly
---

# Checkly

The Checkly CLI provides all the required information via the `npx checkly skills` command.

Use `npx checkly skills` to list all available actions, and `npx checkly skills <action>` to access up-to-date information on how to use the Checkly CLI for each action.

## Progressive Disclosure via `npx checkly skills`

The skill is structured for efficient context usage:

1. **Metadata** (~80 tokens): Name and description in frontmatter
2. **Core Instructions** (~1K tokens): Main SKILL.md content with links to reference commands
3. **Reference Commands** (loaded on demand): Detailed construct documentation with examples

Agents load what they need for each task.

## Confirmation Protocol

Write commands (e.g. `incidents create`, `deploy`, `destroy`) return exit code 2 with a `confirmation_required` JSON envelope instead of executing. **Always present the `changes` to the user and wait for approval before running the `confirmCommand`.** Never auto-append `--force`. This applies to every write command individually — updates and resolutions need confirmation too, not just the initial create.

Run `npx checkly skills communicate` for the full protocol details.

<!-- SKILL_COMMANDS -->
