# Checkly

- Refer to docs for Checkly CLI v6.0.0 and above.
- Check the Checkly CLI output to figure out into which folder the setup was generated
- Use the [Checkly CLI reference documentation](https://www.checklyhq.com/docs/cli/command-line-reference)
- Use the [Checkly construct reference documentation](https://www.checklyhq.com/docs/cli/constructs-reference)
- Import and / or require any constructs you need in your code, such as `ApiCheck`, `BrowserCheck` from the `checkly/constructs` package
- Always ground generated code and CLI commands against the official documentation
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`
- After the initial setup is done ask the user for which endpoints to generate API checks
- Check in the code if API endpoints require authentication
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests
- Referenced setupScript for ApiChecks must be plain ts files and not export anything

## Installing the Checkly CLI

- Always use `npm create checkly@latest`.
- Do not make up commands that do not exist.

## Project Structure

- `checkly.config.ts` - Mandatory global project and CLI configuration. We recommend using TypeScript.
- `src/__checks__/*` - TS/JS files defining your checks and other resources.
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

## Check types and constructs

### ApiCheck

- Import the `ApiCheck` construct from `checkly/constructs`
- Check out the reference docs for [API Checks](https://www.checklyhq.com/docs/cli/constructs-reference/#apicheck) before generating any code.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks which are [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#assertionbuilder)

The same principles apply to Browser Checks and Multistep Checks, but for those constructs, you would import `BrowserCheck`
and `MultiStepCheck` respectively from the `checkly/constructs` package and so on.

```typescript
// INSERT API CHECK EXAMPLE HERE //
```

#### Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly
- Use axios for making HTTP requests
- Read the input credentials from env variables using process.env
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`

### BrowserCheck

- Import the `BrowserCheck` construct from `checkly/constructs`.
- Check out the reference docs for [Browser Checks](https://www.checklyhq.com/docs/cli/constructs-reference/#browsercheck) before generating any code.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `BrowserCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

```typescript
// INSERT BROWSER CHECK EXAMPLE HERE //
```

### MultiStep Check

- Import the `MultiStepCheck` construct from `checkly/constructs`.
- Check out the reference docs for [Multistep Checks](https://www.checklyhq.com/docs/cli/constructs-reference/#multistepcheck) before generating any code.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `MultiStepCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

```typescript
// INSERT MULTISTEP_CHECK EXAMPLE HERE //
```

### Tcp Check

- Import the `TcpCheck` construct from `checkly/constructs`.
- Check out the reference docs for [TCP Checks](https://www.checklyhq.com/docs/cli/constructs-reference/#tcpcheck) before generating any code.
- When adding `assertions`, always use `TcpAssertionBuilder` class for TcpChecks which are [documented here](https://www.checklyhq.com/docs/cli/constructs-reference/#tcpassertionbuilder)

```typescript
// INSERT TCP CHECK EXAMPLE HERE //
```

### Heartbeat Check

- Import the `HeartbeatCheck` construct from `checkly/constructs`.
- Checkout the reference docs for [Heartbeat Checks](https://www.checklyhq.com/docs/cli/constructs-reference/#heartbeatcheck) before generating any code.

```typescript
// INSERT HEARTBEAT_CHECK EXAMPLE HERE //
```

## Testing and Debugging

- Test checks using `npx checkly test` command pass env variables using `-e` param, use `--record` to persist results and `--verbose` to be able to see all errors
