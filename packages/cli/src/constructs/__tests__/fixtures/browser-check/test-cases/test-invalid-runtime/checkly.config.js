import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Check Fixture',
  logicalId: 'check-fixture',
  checks: {
    checkMatch: '**/*.check.js',
    runtimeId: '2025.04',
  },
})

export default config
