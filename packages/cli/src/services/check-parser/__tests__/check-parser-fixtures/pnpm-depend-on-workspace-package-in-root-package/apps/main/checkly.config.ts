import { defineConfig } from 'checkly'

const config = defineConfig({
  logicalId: 'main',
  projectName: 'main',
  checks: {
    playwrightConfigPath: './playwright.config.js',
    playwrightChecks: [
      {
        logicalId: 'main',
        name: 'main',
        frequency: 10,
        locations: [
          'us-east-1',
        ],
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