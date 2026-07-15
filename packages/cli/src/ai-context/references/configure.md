# Checkly Monitoring

- Refer to docs for Checkly CLI v6.0.0 and above.
- Check the Checkly CLI output to figure out into which folder the setup was generated.
- Use the [Checkly CLI reference documentation](https://www.checklyhq.com/docs/cli/overview/).
- Use the [Checkly construct reference documentation](https://www.checklyhq.com/docs/constructs/overview/).
- Import and / or require any constructs you need in your code, such as `ApiCheck`, `BrowserCheck`, or `PlaywrightCheck` from the `checkly/constructs` package.
- Always ground generated code and CLI commands against the official documentation and examples in this file.
- Use `runtimeId` for Browser Checks and MultiStep Checks. Runtimes are managed Checkly execution environments with fixed Checkly-provided dependencies such as Playwright, browser binaries, and runtime libraries.
- Use `engine` only for Playwright Check Suites. `engine` selects the JavaScript engine version that runs the user's own Playwright project.

## Using the Checkly CLI

- Use `npx checkly` instead of installing the Checkly CLI globally.
- NEVER make up commands that do not exist.
- Use `npx checkly init` to set up Checkly in an existing project.

## Project Structure

- `checkly.config.ts` - Mandatory global project and CLI configuration. We recommend using TypeScript.
- `*.check.ts|js` - TS / JS files that define the checks.
- `*.spec.ts|js` - TS / JS files that contain Playwright code for Browser and MultiStep checks.
- `src/__checks__` - Default directory where all your checks are stored. Use this directory if it already exists, otherwise create a new directory for your checks.
- `package.json` - Standard npm project manifest.

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

- Test checks using the `npx checkly test` command. Pass environment variables with the `-e` flag, results are recorded by default (use `--no-record` to skip), and use `--verbose` to see all errors.

## Deploying

- Deploy checks using the `npx checkly deploy` command. Use `--output` to see the created, updated, and deleted resources. Use `--verbose` to also include each resource's name and physical ID (UUID), which is useful for programmatically referencing deployed resources (e.g. `npx checkly checks get <id>`).
- Use `--preview` to see what a deploy would change without applying it.

### Deleted resources

A deploy makes the account match the code. **Any resource that was deployed before and is no longer in the code gets deleted, along with its run history.** Pass `--preserve-resources` to keep those resources and their history in the Checkly account instead, where the user can manage them from the web app.

This matters when the local project isn't the whole picture — a partial checkout, or a project whose checks were also edited elsewhere. If you're not sure the code is the complete source of truth, say so before deploying.

### Confirmation

`deploy` is a write command: without `--force` it returns exit code 2 and a `confirmation_required` envelope. Present its `changes` to the user and run the `confirmCommand` verbatim only after they approve.

Deploy confirms **twice**, and the second one is the one that matters:

1. Up front, before the project is parsed — describes the deploy, and whether checks will be scheduled and resources preserved.
2. After parsing, **only if resources would actually be deleted** — lists each one by name. This is the point where run history is at stake, so show the user that list rather than a summary of it.

Run `npx checkly skills communicate` for the full protocol.
