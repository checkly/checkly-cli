# E2E Tests

### Configuration

Since the E2E tests rely on test accounts in Checkly, some configuration is needed. Configuration is managed with [node-config](https://github.com/node-config/node-config). This package has many features for storing configurations for different environments.

To run the E2E tests locally, create a file `local.js` in [./config](./config). This configuration file should override all of the options from [./config/default.js](./config/default.js).

### Empty account tests (optional)

Some tests verify edge-case behavior against an account with no checks. These are skipped automatically when credentials aren't configured.

To run them locally, add `emptyApiKey` and `emptyAccountId` to your `config/local.js`, or set `CHECKLY_EMPTY_API_KEY` and `CHECKLY_EMPTY_ACCOUNT_ID` in your environment. In CI, these are provided via GitHub secrets.

