import * as Checkly from 'checkly'

const api = new Checkly.constructs.ApiCheck('api-check', {
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
