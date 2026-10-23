import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Max Failures Project',
  logicalId: 'max-failures-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: ['us-east-1'],
    runtimeId: '2023.09',
    checkMatch: '**/*.check.ts',
  },
  cli: {
    runLocation: 'us-east-1',
  },
})

export default config
