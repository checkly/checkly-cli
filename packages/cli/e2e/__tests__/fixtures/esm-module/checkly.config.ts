import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Test ECMAScript Module Project',
  logicalId: 'test-esm-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: '**/*.check.ts',
  },
  cli: {
    runLocation: 'eu-west-1',
  },
})

export default config
