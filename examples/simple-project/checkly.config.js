const { EmailAlertChannel } = require('@checkly/cli/constructs')

const emailAlertChannel = new EmailAlertChannel('chris-test', {
  address: 'chris+test-feb-1@checklyhq.com',
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: true,
})

const config = {
  projectName: 'Simple Project',
  logicalId: 'simple-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    locations: [ 'us-east-1', 'eu-west-1' ],
    tags: ['mac'],
    runtimeId: '2022.10',
    checkMatch: '**/*.check.js',
    alertChannels: [emailAlertChannel],
    browserChecks: {
      testMatch: '**/__checks__/*.spec.js', // this matches any Playwright spec-files and automagically creates a Browser check
    },
  },
  cli: {
    runLocation: 'eu-west-1',
  },
}

// We can export the config directly, or export an async function.
module.exports = async () => config
