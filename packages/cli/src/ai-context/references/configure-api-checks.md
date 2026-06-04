# API Checks

- Import the `ApiCheck` construct from `checkly/constructs`.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks. Import it from `checkly/constructs`.
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`.
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`.
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests.
- Referenced `setup-script.ts` and `teardown-script.ts` for API checks must be plain ts files and not export anything.
- Check in the code if API endpoints require authentication.
- **Important:** The target URL must be publicly accessible. Checks run on Checkly's cloud infrastructure, not locally. If the user is developing against localhost, suggest a tunneling tool (ngrok, cloudflare tunnel) or a preview/staging deployment.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies may not be available on all plans. Check entitlements matching `API_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: API_CHECK -->

## AssertionBuilder Reference

`AssertionBuilder` provides methods to assert on API responses. Available methods:

- `AssertionBuilder.statusCode()` — Numeric. Assert on HTTP status code. Example: `.equals(200)`, `.greaterThan(199)`
- `AssertionBuilder.jsonBody(path)` — General. Assert on JSON body using JSONPath. Example: `AssertionBuilder.jsonBody('$.id').isNotNull()`
- `AssertionBuilder.textBody()` — General. Assert on raw text body. Example: `.contains('OK')`
- `AssertionBuilder.headers(name)` — General. Assert on response headers. Example: `AssertionBuilder.headers('content-type').contains('application/json')`
- `AssertionBuilder.responseTime()` — Numeric. Assert on response time in ms. Example: `.lessThan(2000)`

Two builder types are returned, with different comparators. Use only methods from the matching set — calling a missing method (e.g. `.isNotEmpty()`, `.isGreaterThan()`) compiles but fails at runtime:

- **Numeric** (`statusCode`, `responseTime`): `.equals()`, `.notEquals()`, `.greaterThan()`, `.lessThan()`
- **General** (`jsonBody`, `textBody`, `headers`): `.equals()`, `.notEquals()`, `.contains()`, `.notContains()`, `.greaterThan()`, `.lessThan()`, `.isEmpty()`, `.notEmpty()`, `.isNull()`, `.isNotNull()`, `.hasKey()`, `.notHasKey()`, `.hasValue()`, `.notHasValue()`

Note the names: `notEmpty` (not `isNotEmpty`), `greaterThan` / `lessThan` (not `isGreaterThan` / `isLessThan`).

## Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly.
- Use axios for making HTTP requests.
- Read the input credentials from env variables using `process.env`.
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`.
- For built-in env vars setup/teardown scripts receive at runtime (`CHECK_ID`, `REGION`, `RUNTIME_VERSION`, `PUBLIC_IP_V4`, etc.), see `npx checkly skills configure environment`. The API request itself doesn't run JS — use Handlebars (`{{MY_VAR}}`) in URL, headers, body, basic auth, and query params instead.
