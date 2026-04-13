import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Agentic Check Fixture',
  logicalId: 'agentic-check-fixture',
  checks: {
    checkMatch: '**/*.check.js',
    tags: ['default tags'],
  },
})

export default config
