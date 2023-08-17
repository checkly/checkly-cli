import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Test Project (bad reference project)',
  logicalId: 'test-bad-reference-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac'],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.ts',
    browserChecks: {
      testMatch: '**/*.spec.ts',
    },
  },
})

export default config
