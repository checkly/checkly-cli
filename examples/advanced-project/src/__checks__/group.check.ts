import { CheckGroup, ApiCheck } from '@checkly/cli/constructs'
import { smsChannel, emailChannel } from '../alert-channels'
const alertChannels = [smsChannel, emailChannel]
/*
* In this example, we bundle checks using a Check Group. We add checks to this group in two ways:
* 1. By passing the `CheckGroup` object for the `group` property of the check.
* 2. By defining a glob pattern that matches browser checks using *.spec.js.
*
* You can use either or both.
*/

// We can define multiple checks in a single *.check.js file.
const group = new CheckGroup('check-group-1', {
  name: 'Group',
  activated: true,
  muted: false,
  runtimeId: '2022.10',
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['mac', 'group'],
  environmentVariables: [],
  apiCheckDefaults: {},
  browserCheckDefaults: {},
  concurrency: 100,
  alertChannels,
  browserChecks: {
    testMatch: 'some-dir/*.spec.ts'
  }
})

new ApiCheck('check-group-api-check-1', {
  name: 'Homepage - fetch stats',
  group,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    method: 'GET',
    url: 'https://api.checklyhq.com/public-stats',
    followRedirects: true,
    skipSsl: false,
    assertions: []
  }
})
