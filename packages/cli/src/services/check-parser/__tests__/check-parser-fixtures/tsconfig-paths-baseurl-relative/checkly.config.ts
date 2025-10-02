import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'TSConfig Paths Sample Project',
  logicalId: 'tsconfig-paths-sample-project',
  checks: {
    frequency: 10,
    locations: ['us-east-1'],
    tags: ['mac'],
    runtimeId: '2024.09',
    checkMatch: '**/__checks__/**/*.check.ts',
    browserChecks: {
      testMatch: '**/__checks__/**/*.spec.ts',
    },
  },
  cli: {
    runLocation: 'us-east-1',
    reporters: ['list'],
  },
})

export default config
