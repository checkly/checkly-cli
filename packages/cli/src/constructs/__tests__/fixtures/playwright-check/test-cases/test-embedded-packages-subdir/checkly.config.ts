import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    ignoreDirectoriesMatch: [],
    playwrightConfigPath: './subdir/playwright.config.ts',
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
