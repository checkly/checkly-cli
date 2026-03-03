import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'glob project',
  logicalId: 'glob-project-id',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: ['**/__checks1__/*.check.js', '**/__checks2__/*.check.js', '**/__nested-checks__/*.check.js'],
    browserChecks: {
      testMatch: ['**/__checks1__/*.spec.js', '**/__checks2__/*.spec.js', '**/__nested-checks__/*.spec.js'],
    },
  },
})

export default config
