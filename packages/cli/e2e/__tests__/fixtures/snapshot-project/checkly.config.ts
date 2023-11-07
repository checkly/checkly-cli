import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Snapshot Project',
  logicalId: process.env.PROJECT_LOGICAL_ID!,
  checks: {
    browserChecks: { testMatch: '**/*.spec.ts' },
  },
  cli: {
    runLocation: 'us-east-1',
  },
})

export default config
