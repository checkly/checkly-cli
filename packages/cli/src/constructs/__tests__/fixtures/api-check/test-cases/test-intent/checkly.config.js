import { defineConfig } from 'checkly'

export default defineConfig({
  projectName: 'Check Intent Fixture',
  logicalId: 'check-intent-fixture',
  checks: {
    checkMatch: '**/*.check.js',
  },
})
