import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    ignoreDirectoriesMatch: [],
    playwrightConfigPath: './playwright.config.ts',
    embeddedPackages: ['@acme/private-utils', 'legacy-private-pkg@2.1.0'],
    playwrightChecks: [
      {
        logicalId: 'playwright-check-suite',
        name: 'Playwright Check Suite',
      }
    ],
  },
})

export default config
