# Checkly

- Refer to docs for Checkly CLI v6.0.0 and above.
- Check the Checkly CLI output to figure out into which folder the setup was generated.
- Use the [Checkly CLI reference documentation](https://www.checklyhq.com/docs/cli/command-line-reference).
- Use the [Checkly construct reference documentation](https://www.checklyhq.com/docs/cli/constructs-reference).
- Import and / or require any constructs you need in your code, such as `ApiCheck`, `BrowserCheck` from the `checkly/constructs` package.
- Always ground generated code and CLI commands against the official documentation and examples in this file.

## Installing the Checkly CLI

- ALWAYS use `npm create checkly@latest`.
- NEVER make up commands that do not exist.

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

## Check and Monitor Constructs

### API Check

- Import the `ApiCheck` construct from `checkly/constructs`.
- Reference [the docs for API checks](https://www.checklyhq.com/docs/cli/constructs-reference/#apicheck) before generating any code.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks which are [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#assertionbuilder).
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`.
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`.
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests.
- Referenced `setupScript.ts` and `teardownScript.ts` for API checks must be plain ts files and not export anything.
- Check in the code if API endpoints require authentication.

```typescript
// INSERT API CHECK EXAMPLE HERE //
```

#### Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly.
- Use axios for making HTTP requests.
- Read the input credentials from env variables using `process.env`.
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`.

### Browser Check

- Import the `BrowserCheck` construct from `checkly/constructs`.
- Reference [the docs for Browser checks](https://www.checklyhq.com/docs/cli/constructs-reference/#browsercheck) before generating any code.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `BrowserCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

```typescript
// INSERT BROWSER CHECK EXAMPLE HERE //
```

### MultiStep Check

- Import the `MultiStepCheck` construct from `checkly/constructs`.
- Reference [the docs for Multistep checks](https://www.checklyhq.com/docs/cli/constructs-reference/#multistepcheck) before generating any code.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `MultiStepCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

```typescript
// INSERT MULTISTEP CHECK EXAMPLE HERE //
```

### TCP Monitor

- Import the `TcpMonitor` construct from `checkly/constructs`.
- Reference [the docs for TCP monitors](https://www.checklyhq.com/docs/cli/constructs-reference/#tcpmonitor) before generating any code.
- When adding `assertions`, always use `TcpAssertionBuilder` class for TCP monitors which is [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#tcpassertionbuilder)

```typescript
// INSERT TCP MONITOR EXAMPLE HERE //
```

### URL Monitor

- Import the `UrlMonitor` construct from `checkly/constructs`.
- Reference [the docs for URL monitors](https://www.checklyhq.com/docs/cli/constructs-reference/#urlmonitor) before generating any code.
- When adding `assertions`, always use `UrlAssertionBuilder` class which is [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#urlassertionbuilder)

```typescript
// INSERT URL MONITOR EXAMPLE HERE //
```

### DNS Monitor

- Import the `DnsMonitor` construct from `checkly/constructs`.
- Reference [the docs for DNS monitors](https://www.checklyhq.com/docs/cli/constructs-reference/#dnsmonitor) before generating any code.
- When adding `assertions`, always use `DnsAssertionBuilder` class which is [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#dnsassertionbuilder)

```typescript
// INSERT DNS MONITOR EXAMPLE HERE //
```

### Heartbeat Monitor

- Import the `HeartbeatMonitor` construct from `checkly/constructs`.
- Reference [the docs for Heartbeat monitor](https://www.checklyhq.com/docs/cli/constructs-reference/#heartbeatmonitor) before generating any code.

```typescript
// INSERT HEARTBEAT MONITOR EXAMPLE HERE //
```

### Check Group

- Import the `CheckGroupV2` construct from `checkly/constructs`.
- Reference [the docs for Check Groups](https://www.checklyhq.com/docs/cli/constructs-reference/#checkgroupv2) before generating any code.
- Check Groups are used to group checks together for easier management and organization.
- Checks are added to Check Groups by referencing the group in the `group` property of a check.

```typescript
// INSERT CHECK GROUP EXAMPLE HERE //
```

## Alert Channel Constructs

- Alert channels are used to send notifications when checks and monitors fail or recover.
- Alert channels are added to checks, monitors, and check groups constructs by adding them to the `alertChannels` array property.

Here are some examples of how to create different types of alert channels. All alert are described in the [Checkly docs](https://www.checklyhq.com/docs/cli/constructs-reference/#alertchannel).

### Email Alert Channel

```typescript
// INSERT EMAIL ALERT CHANNEL EXAMPLE HERE //
```


### Phone Call Alert Channel

```typescript
// INSERT PHONE CALL ALERT CHANNEL EXAMPLE HERE //
```


### Slack Alert Channel

```typescript
// INSERT SLACK ALERT CHANNEL EXAMPLE HERE //
```


## Supporting Constructs

### Status Page

- Import the `StatusPage` construct from `checkly/constructs`.
- Reference [the docs for StatusPages](https://www.checklyhq.com/docs/cli/constructs-reference/#statuspage) before generating any code.
- Status pages are used to display the status of your services to your users.
- A Status Page consists of cards which include Status Page Services.

```typescript
// INSERT STATUS PAGE EXAMPLE HERE //
```

### Status Page Service

- Import the `StatusPageService` construct from `checkly/constructs`.
- Reference [the docs for Status Page Services](https://www.checklyhq.com/docs/cli/constructs-reference/#statuspageservice) before generating any code.
- Status Page Services are used to represent individual services on a Status Page.

```typescript
// INSERT STATUS PAGE SERVICE EXAMPLE HERE //
```

### Dashboard

- Import the `Dashboard` construct from `checkly/constructs`.
- Reference [the docs for Dashboards](https://www.checklyhq.com/docs/cli/constructs-reference/#dashboard) before generating any code.
- Dashboards are used to display the results of your checks on screens external to Checkly.

```typescript
// INSERT DASHBOARD EXAMPLE HERE //
```

### Maintenance Window

- Import the `MaintenanceWindow` construct from `checkly/constructs`.
- Reference [the docs for Maintenance Windows](https://www.checklyhq.com/docs/cli/constructs-reference/#maintenancewindow) before generating any code.
- Maintenance windows are used to pause checks during maintenance periods so no alerts are sent.
- Checks are referenced by their tags in the `tags` property.

```typescript
// INSERT MAINTENANCE WINDOW EXAMPLE HERE //
```

### Private Location

- Import the `PrivateLocation` construct from `checkly/constructs`.
- Reference [the docs for Private Locations](https://www.checklyhq.com/docs/cli/constructs-reference/#privatelocation) before generating any code.
- Private locations are used to run checks from your own infrastructure with the Checkly Agent, an OCI compatible container.

```typescript
// INSERT PRIVATE LOCATION EXAMPLE HERE //
```

## Testing and Debugging

- Test checks using `npx checkly test` command pass env variables using `-e` param, use `--record` to persist results and `--verbose` to be able to see all errors
