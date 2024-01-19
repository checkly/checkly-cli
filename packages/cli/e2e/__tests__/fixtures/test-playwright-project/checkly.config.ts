import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Test Playwright Project',
  logicalId: 'test-playwright-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac'],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.ts',
    browserChecks: {
      testMatch: '**/__checks__/*.test.ts',
    },
  },
  cli: {
    runLocation: 'us-east-1',
  },
})

export default config
