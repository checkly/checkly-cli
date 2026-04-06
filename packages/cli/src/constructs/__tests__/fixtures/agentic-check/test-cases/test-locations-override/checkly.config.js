import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Agentic Check Fixture',
  logicalId: 'agentic-check-fixture',
  checks: {
    checkMatch: '**/*.check.js',
    locations: ['eu-west-1', 'ap-southeast-1'],
  },
})

export default config
