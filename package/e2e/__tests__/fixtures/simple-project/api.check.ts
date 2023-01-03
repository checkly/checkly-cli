/* eslint-disable */
import { ApiCheck } from '@checkly/cli/constructs'
new ApiCheck('api-check', {
  name: 'Api Check',
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
