const { CheckGroup, ApiCheck } = require('@checkly/cli/constructs')
const { smsChannel, emailChannel } = require('../alert-channels')
const alertChannels = [smsChannel, emailChannel]
/*
* In this example, we bundle checks using a Check Group. We add checks to this group in two ways:
* 1. By calling the ref() method for the groupId property of the check.
* 2. By defining a glob pattern that matches browser checks using *.spec.js.
*
* You can use either or both.
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
    method: 'GET',
    url: 'https://api.checklyhq.com/public-stats',
  }
})
