import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'My Project',
  logicalId: 'my-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    frequency: 10,
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac'],
    runtimeId: '2023.02',
    checkMatch: '**/__checks__/**/*.check.ts',
    browserChecks: {
      testMatch: '**/__checks__/**/*.spec.ts',
    },
  },
  cli: {
    runLocation: 'eu-west-1',
    reporters: ['list'],
  },
})

export default config
