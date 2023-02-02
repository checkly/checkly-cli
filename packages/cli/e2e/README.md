# E2E Tests

### Configuration

Since the E2E tests rely on test accounts in Checkly, some configuration is needed. Configuration is managed with [node-config](https://github.com/node-config/node-config). This package has many features for storing configurations for different environments.

To run the E2E tests locally, create a file `local.js` in [./config](./config). This configuration file should override all of the options from [./config/default.js](./config/default.js).

