---
name: checkly
description: Set up, create, test and manage monitoring checks using the Checkly CLI. Use when working with API checks, browser checks, URL monitors, ICMP monitors, Playwright checks, heartbeat monitors, alert channels, dashboards, or status pages.
allowed-tools: Bash(npx:checkly:*) Bash(npm:create:checkly@latest) Bash(npm:install:*)
metadata:
  author: checkly
---

# Checkly

The Checkly CLI provides all the required information via the `npx checkly skills` command.

Use `npx checkly skills list` to list the documentation for all possible actions, and `npx checkly skills show <action>` to access up-to-date information on how to use the Checkly CLI for each action.

## Setup

- `npx checkly skills show setup` - Set up a new Checkly CLI project to monitor from scratch.

## Configure

- `npx checkly skills show configure` - Create and manage monitoring checks using the Checkly CLI.
- `npx checkly skills show configure api-checks` - ApiCheck construct, assertions, and authentication setup scripts
- `npx checkly skills show configure browser-checks` - BrowserCheck construct with Playwright test files
- `npx checkly skills show configure playwright-checks` - PlaywrightCheck construct for multi-browser test suites
- `npx checkly skills show configure multistep-checks` - MultiStepCheck construct for complex user flows
- `npx checkly skills show configure uptime-monitors` - TCP (`TcpMonitor`), URL (`UrlMonitor`), DNS (`DnsMonitor`), ICMP (`IcmpMonitor`), and Heartbeat monitors (`HeartbeatMonitor`)
- `npx checkly skills show configure check-groups` - CheckGroupV2 construct for organizing checks
- `npx checkly skills show configure alert-channels` - Email, Phone, and Slack alert channels
- `npx checkly skills show configure supporting-constructs` - Status pages, dashboards, maintenance windows, and private locations
