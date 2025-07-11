/* eslint-disable */
import { ApiCheck, BrowserCheck, CheckGroupV2 } from 'checkly/constructs'

const group1 = new CheckGroupV2('my-check-group', {
  name: 'My Group',
  locations: ['us-east-1']
})

new ApiCheck('api-check', {
  name: 'Api Check',
  activated: false,
  group: group1,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: []
  },
  setupScript: {content: "console.log('hi from setup')"},
  tearDownScript: {content: "console.log('hi from teardown')"},
  degradedResponseTime: 20000,
  maxResponseTime: 30000
})
