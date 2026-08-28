import { defineConfig } from 'checkly'

// Same fixture as checkly.config.ts, pruning via a member-scoped keep
// instead of a global class map: the imported member's manifest keeps its
// dependencies and every other dependency class empties out.
const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  bundle: {
    packages: {
      prune: [
        { member: '@fixture-prune/used', keep: { dependencies: true } },
      ],
    },
  },
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
})

export default config
