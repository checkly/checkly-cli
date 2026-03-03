import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'glob project',
  logicalId: 'glob-project-id',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    browserChecks: {
      testMatch: ['**/__checks__/browser/*.spec.js'],
    },
    multiStepChecks: {
      testMatch: ['**/__checks__/multistep/*.spec.js'],
    },
  },
})

export default config
