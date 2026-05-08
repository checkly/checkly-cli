import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
  },
})

export default config
