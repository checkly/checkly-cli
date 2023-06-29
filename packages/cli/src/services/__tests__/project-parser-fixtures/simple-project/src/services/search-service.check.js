/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-new */
const path = require('path')
const { BrowserCheck, ApiCheck } = require('../../../../../../constructs')

new BrowserCheck('browser-check-2', {
  name: 'Search Service Check',
  code: {
    entrypoint: path.join(__dirname, 'search-service.spec.js'),
  },
})

new ApiCheck('api-check-1', {
  name: 'Api Check',
  activated: false,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: [],
  },
  setupScript: { content: "console.log('hi from setup')" },
  tearDownScript: { content: "console.log('hi from teardown')" },
  degradedResponseTime: 20000,
  maxResponseTime: 30000,
})
