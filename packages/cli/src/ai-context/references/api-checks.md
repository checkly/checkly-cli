# API Checks

- Import the `ApiCheck` construct from `checkly/constructs`.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks.
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`.
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`.
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests.
- Referenced `setupScript.ts` and `teardownScript.ts` for API checks must be plain ts files and not export anything.
- Check in the code if API endpoints require authentication.

<!-- EXAMPLE: API_CHECK -->

## Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly.
- Use axios for making HTTP requests.
- Read the input credentials from env variables using `process.env`.
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`.
