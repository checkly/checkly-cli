# Checkly Monitoring

- Refer to docs for Checkly CLI v6.0.0 and above.
- Check the Checkly CLI output to figure out into which folder the setup was generated.
- Use the [Checkly CLI reference documentation](https://www.checklyhq.com/docs/cli/overview/).
- Use the [Checkly construct reference documentation](https://www.checklyhq.com/docs/constructs/overview/).
- Import and / or require any constructs you need in your code, such as `ApiCheck`, `BrowserCheck`, or `PlaywrightCheck` from the `checkly/constructs` package.
- Always ground generated code and CLI commands against the official documentation and examples in this file.

## Using the Checkly CLI

- Use `npx checkly` instead of installing the Checkly CLI globally.
- NEVER make up commands that do not exist.
- Use `npx checkly init` to set up Checkly in an existing project.

## Project Structure

- `checkly.config.ts` - Mandatory global project and CLI configuration. We recommend using TypeScript.
- `*.check.ts|js` - TS / JS files that define the checks.
- `*.spec.ts|js` - TS / JS files that contain Playwright code for Browser and MultiStep checks.
- `src/__checks__` - Default directory where all your checks are stored. Use this directory if it already exists, otherwise create a new directory for your checks.
- `package.json` - Standard NPM project manifest.

Here is an example directory tree of what that would look like:

```
.
|-- checkly.config.ts
|-- package.json
`-- src
    `-- __checks__
|-- alert-channels.ts
|-- api-check.check.ts
`-- homepage.spec.ts
```

The `checkly.config.ts` at the root of your project defines a range of defaults for all your checks.

<!-- EXAMPLE: CHECKLY_CONFIG -->

## Check and Monitor Constructs

Parse and read further reference documentation when tasked with creating or managing any of the following Checkly constructs.

If the Checkly CLI is installed (`npx checkly version`), use `npx checkly skills configure [CONSTRUCT]` to access up-to-date information:

<!-- REFERENCE_COMMANDS -->

## Important: Public URL Requirement

All checks (API, Browser, URL monitors) run on **Checkly's cloud infrastructure**, not on the user's local machine. Target URLs must be publicly accessible from the internet.

- `localhost` and private network URLs will **not work** with `npx checkly test` or `npx checkly deploy`
- For local development, suggest: tunneling tools (ngrok, cloudflare tunnel), preview/staging deployments, or CI preview URLs
- Always confirm with the user that their target URLs are publicly reachable before creating checks

## Check Locations and Plan Entitlements

Not all features and locations are available on all plans. **Before configuring checks, run:**

```bash
npx checkly account plan --output json
```

This returns your exact entitlements and available locations. Use only locations where `available` is `true` in the `locations.all` array. If a feature is disabled, the response includes an `upgradeUrl` to share with the user.

Run `npx checkly skills manage plan` for the full reference.

## Testing and Debugging

- Test checks using the `npx checkly test` command. Pass environment variables with the `-e` flag, use `--record` to persist results, and use `--verbose` to see all errors.

## Deploying

- Deploy checks using the `npx checkly deploy` command. Use `--output` to see the created, updated, and deleted resources. Use `--verbose` to also include each resource's name and physical ID (UUID), which is useful for programmatically referencing deployed resources (e.g. `npx checkly checks get <id>`).
