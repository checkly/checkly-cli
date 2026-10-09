// No defineConfig(): its type rejects the removed `groupName` property,
// which this fixture passes on purpose, the way an untyped config would.
const config = {
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'check',
        name: 'Check',
        groupName: 'Group',
      },
    ],
  },
}

export default config
