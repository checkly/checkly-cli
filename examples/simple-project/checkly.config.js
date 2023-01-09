const config = {
  projectName: 'Simple Project',
  logicalId: 'simple-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: [ 'us-east-1', 'eu-west-1' ],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.js',
    browserChecks: {
      testMatch: '**/__checks__/*.spec.js',
    },
  },
  cli: {
    runLocation: 'eu-west-1',
  },
}

// We can export the config directly, or export an async function.
module.exports = async () => config
