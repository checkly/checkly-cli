---
name: monitoring
description: Create and manage monitoring checks using the Checkly CLI. Use when working with API checks, browser checks, URL monitors, Playwright checks, heartbeat monitors, alert channels, dashboards, or status pages.
allowed-tools: Bash(npx:checkly:*) Bash(npm:create:checkly@latest)
metadata:
  author: checkly
---

# Checkly Monitoring

- Refer to docs for Checkly CLI v6.0.0 and above.
- Check the Checkly CLI output to figure out into which folder the setup was generated.
- Use the [Checkly CLI reference documentation](https://www.checklyhq.com/docs/cli/overview/).
- Use the [Checkly construct reference documentation](https://www.checklyhq.com/docs/constructs/overview/).
- Import and / or require any constructs you need in your code, such as `ApiCheck`, `BrowserCheck`, or `PlaywrightCheck` from the `checkly/constructs` package.
- Always ground generated code and CLI commands against the official documentation and examples in this file.

## Using the Checkly CLI

- Use `npx checkly` or `npm create checkly@latest` (see below) instead of installing the Checkly CLI globally.
- NEVER make up commands that do not exist.
- Use `npm create checkly@latest` to set up a new Checkly project via the CLI.

## Project Structure

- `checkly.config.ts` - Mandatory global project and CLI configuration. We recommend using TypeScript.
- `*.check.ts|js` - TS / JS files that define the checks.
- `*.spec.ts|js` - TS / JS files that contain Playwright code for Browser and MultiStep checks.
- `src/__checks__` - Default directory where all your checks are stored. Use this directory if it already exists, otherwise create a new directory for your checks.
- `package.json` - Standard NPM project manifest.

Here is an example directory tree of what that would look like:

.
|-- checkly.config.ts
|-- package.json
`-- src
    `-- __checks__
|-- alert-channels.ts
|-- api-check.check.ts
`-- homepage.spec.ts

The `checkly.config.ts` at the root of your project defines a range of defaults for all your checks.

<!-- EXAMPLE: CHECKLY_CONFIG -->

## Check and Monitor Constructs

<!-- REFERENCE_LINKS -->
