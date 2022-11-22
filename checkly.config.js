const { Project, BrowserCheck, EmailAlertChannel, CheckGroup } = require('./sdk/constructs')

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
  // TODO: All of these subscriptions are considered active.
  // Is there a nice way to allow users to set inactive subscriptions?
  // Or should we just disallow this?
  alertChannelSubscriptions: [emailAlertChannel],
})

// Note that the alert channel and subscription are added automatically.
// We track them because they belong to the check.
// A downside is that when the check is removed, we remove the alert channel...
project.addCheck(signupCheck)

const loginCheck = new BrowserCheck('login', {
  name: 'Login Check',
  activated: true,
  script: 'console.log("logging in")',
})

const checkGroup = new CheckGroup('my-group', {
  name: 'Critical Checks',
  checks: [loginCheck],
})

// Note that loginCheck is added automatically when the group is added.
project.addCheckGroup(checkGroup)

const emailAlertChannel2 = new EmailAlertChannel('email-again', {
  address: 'another-alert-channel@checklyhq.com',
})

// We can also add an alert channel separately.
project.addAlertChannel(emailAlertChannel2)

module.exports = project
