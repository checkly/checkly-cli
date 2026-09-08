import { defineConfig } from 'checkly'

export default defineConfig({
  projectName: 'Agentic Check Fixture',
  logicalId: 'agentic-check-fixture',
  checks: {
    checkMatch: '**/*.check.js',
  },
})
