import { defineConfig } from 'checkly'
import { CheckGroupV2 } from 'checkly/constructs'

const group = new CheckGroupV2('config-group', {
  name: 'Config Group',
})

const existingGroup = CheckGroupV2.fromId(123)

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'check',
        name: 'Check',
        group,
      },
      {
        logicalId: 'check-existing-group',
        name: 'Check in existing group',
        group: existingGroup,
      },
    ],
  },
})

export default config
