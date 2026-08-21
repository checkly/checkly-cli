import { defineConfig } from 'checkly'

// Same project as checkly.config.ts but with a smaller embed list, so tests
// can assert that the resolved embedded-packages set influences the payload
// cacheHash.
const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    ignoreDirectoriesMatch: [],
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'playwright-check-suite',
        name: 'Playwright Check Suite',
      }
    ],
  },
  bundle: {
    packages: {
      embed: ['@acme/private-utils'],
    },
  },
})

export default config
