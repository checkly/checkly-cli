import { defineConfig } from '@checkly/cli'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac'],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.ts',
    browserChecks: {
      testMatch: '**/__checks__/*.spec.ts',
    },
  },
  cli: {
    runLocation: 'eu-west-1',
  },
})

export default config
