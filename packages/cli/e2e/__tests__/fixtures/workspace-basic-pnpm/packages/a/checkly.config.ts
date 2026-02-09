import { defineConfig } from 'checkly'

const config = defineConfig({
  logicalId: 'my-app',
  projectName: 'my-app',
  checks: {
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'my-app-tests',
        name: 'my-app-tests',
        frequency: 10,
        locations: [
          'us-east-1',
        ],
        installCommand: 'pnpm i',
      },
    ],
    frequency: 10,
    locations: [
      'us-east-1',
    ],
  },
  cli: {
    runLocation: 'us-east-1',
  },
})

export default config
