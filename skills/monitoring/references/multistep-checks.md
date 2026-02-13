# MultiStep Checks

- Import the `MultiStepCheck` construct from `checkly/constructs`.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `MultiStepCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.

**Reference:** https://www.checklyhq.com/docs/constructs/multistep-check/

```typescript
import { AlertEscalationBuilder, Frequency, MultiStepCheck, RetryStrategyBuilder } from 'checkly/constructs'

new MultiStepCheck('example-multi-step-check', {
  name: 'Example Multistep Check',
  code: {
    entrypoint: './example-multistep-check.spec.ts',
  },
  activated: true,
  locations: [
    'eu-central-1',
    'eu-west-2',
  ],
  frequency: Frequency.EVERY_1H,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.noRetries(),
  runParallel: true,
})
```
