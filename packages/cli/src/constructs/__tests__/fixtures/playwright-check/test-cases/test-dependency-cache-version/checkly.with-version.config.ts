import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
  },
  caching: {
    dependencyCache: {
      version: 'v2',
    },
  },
})

export default config
