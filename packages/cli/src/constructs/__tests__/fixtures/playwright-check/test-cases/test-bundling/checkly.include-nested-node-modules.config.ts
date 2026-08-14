import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
    ignoreDirectoriesMatch: [],
    // The sub/node_modules directory is created by the test at run time (real
    // directories, not the sandbox's out-of-project template link).
    include: ['sub/node_modules/pkg/**'],
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
