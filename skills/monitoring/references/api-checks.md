# API Checks

- Import the `ApiCheck` construct from `checkly/constructs`.
- When adding `assertions`, always use `AssertionBuilder` class for API Checks.
- When referencing environment variables always use the handlebar syntax `{{MY_ENV_VAR}}`.
- When referencing secrets always use the handlebar syntax `{{MY_SECRET}}`.
- If endpoints require authentication ask the user which authentication method to use and then generate a setupScript to authenticate the given requests.
- Referenced `setup-script.ts` and `teardown-script.ts` for API checks must be plain ts files and not export anything.
- Check in the code if API endpoints require authentication.

**Reference:** https://www.checklyhq.com/docs/constructs/api-check/

```typescript
import { AlertEscalationBuilder, ApiCheck, Frequency, RetryStrategyBuilder } from 'checkly/constructs'

new ApiCheck('example-api-check', {
  name: 'Example API Check',
  setupScript: {
    entrypoint: './setup-script.ts',
  },
  tearDownScript: {
    entrypoint: './teardown-script.ts',
  },
  degradedResponseTime: 5000,
  maxResponseTime: 20000,
  activated: true,
  locations: [
    'eu-central-1',
    'eu-west-2',
  ],
  frequency: Frequency.EVERY_5M,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.linearStrategy({
    baseBackoffSeconds: 60,
    maxRetries: 2,
    maxDurationSeconds: 600,
    sameRegion: true,
  }),
  runParallel: true,
  request: {
    url: 'https://api.example.com/v1/products',
    method: 'GET',
    ipFamily: 'IPv4',
  },
})
```

## Authentication Setup Scripts for API Checks

- Setup scripts should be flat scripts, no functions, no exports, they will be executed straight by Checkly.
- Use axios for making HTTP requests.
- Read the input credentials from env variables using `process.env`.
- Pass auth tokens to the request object using `request.headers['key'] = AUTH_TOKEN_VALUE`.
