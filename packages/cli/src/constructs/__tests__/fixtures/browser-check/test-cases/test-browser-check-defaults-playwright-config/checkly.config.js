import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.js',
    tags: ['default tags'],
    playwrightConfig: {
      use: {
        baseURL: 'https://example.org/check-defaults',
      },
    },
    browserChecks: {
      tags: ['browser default tags'],
      playwrightConfig: {
        use: {
          baseURL: 'https://example.org/browser-defaults',
        },
      },
    },
  },
})

export default config
