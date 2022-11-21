// const { join } = require('path')
const { Project, BrowserCheck } = require('./sdk/constructs')
// const { Project, Check, AlertChannel } = require('./sdk/types')

// const alert = new AlertChannel({
/*
const alert = {
  type: 'EMAIL',
  config: {
    address: 'test@test.com',
  },
  sslExpiry: false,
  sslExpiryThreshold: 30,
}
*/
// Creating a check manually
// const check = new Check({
/*
const check = {
  name: 'A check',
  checkType: 'BROWSER',
  // We parse the files and populate script and dependencies fields ourselves
  script: 'console.log(1)',
  activated: false,
  entry: join(__dirname, 'dir/test.spec.js'),
  alertChannels: [alert],
}
*/

// const project = new Project('sampleProject')
/*
const project = {
  project: {
    name: 'Example',
    logicalId: 'example_project',
  },
  alertChannels: {
    example_channel: alert,
  },
  checks: {
    example_check: check,
  },
}
*/

// project.addAlertChannel('example_channel', alert)
// project.addCheck('example_check', check)

// Change the CHECK_ENV env variable to create different projects
const environment = process.env.CHECK_ENV ?? 'prod'

const project = new Project(`monitor-${environment}`, {
  name: 'New Project',
})

const signupCheck = new BrowserCheck('signup', {
  name: 'Signup Check',
  activated: true,
  script: 'console.log("it works")',
})

project.addCheck(signupCheck)

module.exports = project
