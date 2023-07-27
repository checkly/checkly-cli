import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Boilerplate Project',
  logicalId: 'boilerplate-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: '**/__checks__/**/*.check.ts',
  },
  cli: {
    runLocation: 'eu-west-1',
  },
})

export default config