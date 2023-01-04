/* eslint-disable */
import { ApiCheck, BrowserCheck } from '@checkly/cli/constructs'
new ApiCheck('api-check', {
  name: 'Api Check',
  activated: false,
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

new BrowserCheck('browser-check', {
  name: 'Browser Check',
  activated: false,
  code: {
    // Remove the throw new Error when we support a verbose flag for check output
    content: 'console.info(process.env.SECRET_ENV); throw new Error();'
  }
})
