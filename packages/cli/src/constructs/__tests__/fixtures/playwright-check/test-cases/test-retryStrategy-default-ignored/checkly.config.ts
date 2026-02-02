import { defineConfig } from 'checkly'
import { RetryStrategyBuilder } from 'checkly/constructs'

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    retryStrategy: RetryStrategyBuilder.fixedStrategy({ maxRetries: 3 }),
  },
})

export default config
