const path = require('path')
const { CheckGroup, ApiCheck } = require('@checkly/cli/constructs')
const { smsChannel, emailChannel } = require('../../alert-channels')
const alertChannels = [smsChannel, emailChannel]
/*
* In this example, we bundle checks using check group functionality. We define a CheckGroup
* here that matches browser checks usings .spec.js. This is also useful.
* We can also add more checks into one file, in this case to cover a specific API call needed to hydrate the homepage.
*/

// We can define multiple checks in a single *.check.js file.
const group = new CheckGroup('check-group-1', {
  name: 'Group',
  activated: true,
  alertChannels,
  concurrency: 10,
  browserChecks: {
    testMatch: '*.spec.js'
  }
})

new ApiCheck('check-group-api-check-1', {
  name: 'Homepage - fetch stats',
  groupId: group.ref(),
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    followRedirects: true,
    skipSsl: false,
  }
})