# Browser Checks

- Import the `BrowserCheck` construct from `checkly/constructs`.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `BrowserCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

**Reference:** https://www.checklyhq.com/docs/constructs/browser-check/

```typescript
import { AlertEscalationBuilder, BrowserCheck, Frequency, RetryStrategyBuilder } from 'checkly/constructs'

new BrowserCheck('example-browser-check', {
  name: 'Example Browser Check',
  code: {
    entrypoint: './example-browser-check.spec.ts',
  },
  activated: false,
  locations: [
    'eu-central-1',
    'eu-west-2',
  ],
  frequency: Frequency.EVERY_10M,
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
})
```
