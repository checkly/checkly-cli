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

This returns your exact entitlements and available locations. Use only locations where `available` is `true` in the `locations.all` array. A disabled feature may include an `upgradeUrl`; share it only when present. Without one, the feature is unavailable.

Run `npx checkly skills manage plan` for the full reference.

## Testing and Debugging

- Test checks using the `npx checkly test` command. Pass environment variables with the `-e` flag, results are recorded by default (use `--no-record` to skip), and use `--verbose` to see all errors.

## Deploying

- Deploy checks using the `npx checkly deploy` command. Use `--output` to see the created, updated, and deleted resources. Use `--verbose` to also include each resource's name and physical ID (UUID), which is useful for programmatically referencing deployed resources (e.g. `npx checkly checks get <id>`).
- Use `--plan` to have Checkly plan the deploy first: it compares every resource with what is deployed, property by property, the deploy then writes only the resources that differ, and it refuses to run if the account changed after the plan was made. Without `--plan`, which is the default, a deploy writes every resource the project declares and overwrites edits made outside the project without reporting them. `--no-plan` states the default explicitly.
- A resource Checkly has no baseline for (for example every resource already deployed on a project's first `checkly deploy --plan` or on the first after any deploy without `--plan`, one added with `checkly import`, or one whose stored baseline a Checkly update made unusable) is updated once to set it, and the plan lists it as an update whether or not anything differs; a note under the overview counts these resources. Such an entry carries `basis: "live"` in the machine-readable plan, and its list of changes is not exhaustive: a value set only in Checkly, on a property the code does not set, may be reset without being shown. Later deploys with `--plan` show and write only what changed.
- Use `--preview` to see which resources a deploy would create, update or delete, without applying it. With `--plan` it also shows the resources the deploy would keep as they are and a diff of each updated resource's construct as deployed against as in code, and a plain interactive `checkly deploy --plan` prints that same preview before asking the user to apply the changes or cancel. With `--plan`, the machine-readable forms (`--dry-run`, and the `confirmation_required` envelope) additionally carry the individual properties that would change; without it they list the deploy's options and the resources it would delete.
- When the preview shows a resource that was edited outside the project (in the web app or through the API), an interactive `checkly deploy --plan` offers a third choice next to apply and cancel: update the code with the values from Checkly and deploy nothing. It exists only in a terminal; there is no flag for it, and the `confirmation_required` envelope is unchanged.
  - It rewrites literal values (strings, numbers, booleans, and arrays or objects of those; a multi-line string over a template literal is written as a template literal) and the helper-spelled properties `frequency` (`Frequency.EVERY_5M`), `retryStrategy` (`RetryStrategyBuilder`), `alertEscalationPolicy` (`AlertEscalationBuilder`) and `assertions` (the class's assertion builder) inside the `new SomeConstruct('id', { … })` call, adds a helper's import when the file lacks it, and leaves the rest of the file untouched. Covered: checks and check groups (including `runtimeId` on runtime checks and groups, the `request` of every check and monitor type, `sslCheckDomain` and `aiAutoRepairEnabled` on browser checks, `aiAutoRepairEnabled` on multistep checks and `prompt` on agentic checks), alert channels of every type, private locations, dashboards, maintenance windows (`repeatInterval` and `repeatUnit` together), status pages (v2 and v3, each theme colour under an existing `themeColors.light`/`.dark`), status page services, v3 components and automation rules.
  - It lists everything it could not update with the reason: references to other resources, secrets (a credential such as a webhook URL or API key is never written), scripts, a dashboard's `customCSS`, an incident trigger, an alert channel's type or a webhook-based channel's fixed type and method, Telegram's packed template, a helper call holding a variable, `doubleCheck` set beside a retry strategy, a check moved to the global alert policy, which needs `alertEscalationPolicy` removed by hand.
- Use `--prune-relations` to also delete the alert channel subscriptions and private location assignments on this project's checks and groups that the project does not manage. Without it they are only reported. Requires `--plan`.

### Deleted resources

A deploy makes the account match the code. **Any resource that was deployed before and is no longer in the code gets deleted, along with its run history.** Pass `--preserve-resources` to keep those resources and their history in the Checkly account instead, where the user can manage them from the web app.

This matters when the local project isn't the whole picture — a partial checkout, or a project whose checks were also edited elsewhere. If you're not sure the code is the complete source of truth, say so before deploying.

### Confirmation

`deploy` is a write command: without `--force` it returns exit code 2 and a `confirmation_required` envelope. Present its `changes` to the user and run the `confirmCommand` verbatim only after they approve. The one exception is a `checkly deploy --plan` whose plan has nothing to create, update, delete or detach and no relation to prune: it asks for no confirmation, prints `No changes.`, and completes with exit code 0. That run still records the deployment and schedules the checks unless `--no-schedule-on-deploy` is passed; its last line says whether it did.

The confirmation happens **after** the project has been parsed. Unless the run passed `--preserve-resources`, Checkly has also been asked what the deploy would delete, and every resource to be deleted is named in `changes`. Show the user the deletions before you run the `confirmCommand`. Nothing has been written or uploaded at that point.

Under `--plan`, `changes` names every resource the deploy touches, and the envelope carries a `preview` object with the machine-readable plan — one entry per resource, with the properties that would change. If Checkly could not provide a plan, the run says so and continues as one without `--plan`: the envelope then has no `preview` object. The envelope's `preview.planToken` identifies the plan, and the `confirmCommand` carries it as `--plan-token`. The confirming run therefore applies that plan against the same Checkly state and aborts if the account moved in between; it does not pin your local code, so an edit you make between the two runs is previewed again and deployed without a second prompt (see "Commands that pin a resolved target" in the `communicate` skill).

To look without confirming anything:

```bash
npx checkly deploy --plan --preview
```

Nothing is applied and nothing is confirmed. It prints the resources that would be created, updated, deleted and kept, and the plan token (add `--verbose` for names and IDs). `--plan --dry-run` does the same for machine consumption: it prints the `dry_run` envelope, with the same `preview` object, and exits 0. Without `--plan`, neither form has a plan to show: `--preview` lists every existing resource as an update, and the `--dry-run` envelope has no `preview` object.

Run `npx checkly skills communicate` for the full protocol.
