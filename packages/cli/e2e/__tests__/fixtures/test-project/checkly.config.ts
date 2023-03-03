import { defineConfig } from '@checkly/cli'

const config = defineConfig({
  projectName: 'Test Project',
  logicalId: 'test-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac'],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.ts',
    browserChecks: {
      // using .test.ts suffix (no .spec.ts) to avoid '@playwright/test not found error' when Jest transpile the spec.ts
      testMatch: '**/__checks__/*.test.ts',
    },
  },
  cli: {
    runLocation: 'us-east-1',
  },
})

export default config
