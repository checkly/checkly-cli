import { PlaywrightCheck, RetryStrategyBuilder } from 'checkly/constructs'

const check = new PlaywrightCheck('check', {
  name: 'Check',

  playwrightConfigPath: './playwright.config.ts',

  // @ts-expect-error - Testing runtime validation. TypeScript should prevent this at compile time.
  retryStrategy: RetryStrategyBuilder.fixedStrategy({ maxRetries: 3 }),
})
