const { join } = require('path')
const { Project, BrowserCheck, ApiCheck, EmailAlertChannel, CheckGroup, EnvironmentVariable } = require('./sdk/constructs')

// Change the CHECK_ENV env variable to create different projects
const environment = process.env.CHECK_ENV ?? 'prod'

const project = new Project(`monitor-${environment}`, {
  name: 'New Project',
})

const emailAlertChannel = new EmailAlertChannel('email-chris', {
  address: 'email-address@checklyhq.com',
})

const signupCheck = new BrowserCheck('signup', {
  name: 'Signup Check',
  activated: true,
  script: 'console.log("it works")',
  entry: join(__dirname, 'checks/example/script.js'),
  // TODO: All of these subscriptions are considered active.
  // Is there a nice way to allow users to set inactive subscriptions?
  // Or should we just disallow this?
  alertChannelSubscriptions: [emailAlertChannel],
})

// Note that the alert channel and subscription are added automatically.
// We track them because they belong to the check.
// A downside is that when the check is removed, we remove the alert channel...
project.addCheck(signupCheck)

const googleCheck = new ApiCheck('google', {
  name: 'Google Check',
  activated: true,
  request: {
    url: 'https://google.com/',
    method: 'GET',
    followRedirects: true,
    skipSsl: false,
    assertion: {
      source: 'STATUS_CODE',
      comparison: 'EQUALS',
      target: '200',
    },
  },
  alertChannelSubscriptions: [emailAlertChannel],
})

project.addCheck(googleCheck)

const failingCheck = new BrowserCheck('fail', {
  name: 'Failing Check',
  activated: true,
  script: 'throw new Error(\'Error during login\')',
})
project.addCheck(failingCheck)

const loginCheck = new BrowserCheck('login', {
  name: 'Login Check',
  activated: true,
  script: 'console.log("logging in")',
})

const checkGroup = new CheckGroup('my-group', {
  name: 'Critical Checks',
  activated: true,
  checks: [loginCheck],
  concurrency: 5,
  environmentVariables: [new EnvironmentVariable({ key: 'SECRET_ENV', value: 'So secret!!' })],
})

// Note that loginCheck is added automatically when the group is added.
project.addCheckGroup(checkGroup)

const emailAlertChannel2 = new EmailAlertChannel('email-again', {
  address: 'another-alert-channel@checklyhq.com',
})

// We can also add an alert channel separately.
project.addAlertChannel(emailAlertChannel2)

module.exports = project
