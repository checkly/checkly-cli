import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    ignoreDirectoriesMatch: [],
    // The second pattern reaches *through* the member link to an asset file the
    // parser cannot see (nothing imports it) — it must land at the member's
    // real path.
    include: ['node_modules/**', 'node_modules/@scope/x/src/assets/**'],
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'playwright-check-suite',
        name: 'Playwright Check Suite',
      }
    ],
  },
})

export default config
