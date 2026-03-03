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

- `npx checkly skills show setup` - Learn how to set up a new Checkly CLI project from scratch.

## Configure

- `npx checkly skills show configure` - Learn how to create and manage monitoring checks using Checkly constructs and the CLI.
- `npx checkly skills show configure api-checks` - Api Check construct (`ApiCheck`), assertions, and authentication setup scripts
- `npx checkly skills show configure browser-checks` - Browser Check construct (`BrowserCheck`) with Playwright test files
- `npx checkly skills show configure playwright-checks` - Playwright Check Suite construct (`PlaywrightCheck`) for multi-browser test suites
- `npx checkly skills show configure multistep-checks` - Multistep Check construct (`MultiStepCheck`) for complex user flows
- `npx checkly skills show configure tcp-monitors` - TCP Monitor construct (`TcpMonitor`) with assertions
- `npx checkly skills show configure url-monitors` - URL Monitor construct (`UrlMonitor`) with assertions
- `npx checkly skills show configure dns-monitors` - DNS Monitor construct (`DnsMonitor`) with assertions
- `npx checkly skills show configure icmp-monitors` - ICMP Monitor construct (`IcmpMonitor`) with latency and packet loss assertions
- `npx checkly skills show configure heartbeat-monitors` - Heartbeat Monitor construct (`HeartbeatMonitor`)
- `npx checkly skills show configure check-groups` - CheckGroupV2 construct (`CheckGroupV2`) for organizing checks
- `npx checkly skills show configure alert-channels` - Email (`EmailAlertChannel`), Phone (`PhoneAlertChannel`), and Slack (`SlackAlertChannel`) alert channels
- `npx checkly skills show configure supporting-constructs` - Status pages (`StatusPage`), dashboards (`Dashboard`), maintenance windows (`MaintenanceWindow`), and private locations (`PrivateLocation`)
