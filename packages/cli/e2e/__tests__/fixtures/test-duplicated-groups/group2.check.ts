/* eslint-disable */
import { ApiCheck, BrowserCheck, CheckGroup } from '@checkly/cli/constructs'

const group1 = new CheckGroup('my-check-group', {
  name: 'My Group',
  locations: ['us-east-1']
})

new ApiCheck('api-check', {
  name: 'Api Check',
  activated: false,
  groupId: group1.ref(),
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSsl: false,
    assertions: []
  },
  localSetupScript: "console.log('hi from setup')",
  localTearDownScript: "console.log('hi from teardown')",
  degradedResponseTime: 20000,
  maxResponseTime: 30000
})