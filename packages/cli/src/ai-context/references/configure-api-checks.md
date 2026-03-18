# API Checks

- Import the `ApiCheck` construct from `checkly/constructs`.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks. Import it from `checkly/constructs`.
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`.
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`.
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests.
- Referenced `setup-script.ts` and `teardown-script.ts` for API checks must be plain ts files and not export anything.
- Check in the code if API endpoints require authentication.
- **Important:** The target URL must be publicly accessible. Checks run on Checkly's cloud infrastructure, not locally. If the user is developing against localhost, suggest a tunneling tool (ngrok, cloudflare tunnel) or a preview/staging deployment.

<!-- EXAMPLE: API_CHECK -->

## AssertionBuilder Reference

`AssertionBuilder` provides methods to assert on API responses. Available methods:

- `AssertionBuilder.statusCode()` — Assert on HTTP status code. Example: `.equals(200)`, `.isGreaterThan(199)`
- `AssertionBuilder.jsonBody(path)` — Assert on JSON body using JSONPath. Example: `AssertionBuilder.jsonBody('$.id').isNotNull()`
- `AssertionBuilder.textBody()` — Assert on raw text body. Example: `.contains('OK')`
- `AssertionBuilder.headers(name)` — Assert on response headers. Example: `AssertionBuilder.headers('content-type').contains('application/json')`
- `AssertionBuilder.responseTime()` — Assert on response time in ms. Example: `.isLessThan(2000)`

Each method returns a chainable builder with comparison methods: `.equals()`, `.notEquals()`, `.contains()`, `.notContains()`, `.isGreaterThan()`, `.isLessThan()`, `.isEmpty()`, `.isNotEmpty()`, `.isNull()`, `.isNotNull()`

## Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly.
- Use axios for making HTTP requests.
- Read the input credentials from env variables using `process.env`.
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`.
