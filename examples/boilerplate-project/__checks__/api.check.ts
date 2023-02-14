import { ApiCheck, AssertionBuilder } from '@checkly/cli/constructs'

new ApiCheck('homepage-api-check-1', {
  name: 'Homepage - fetch stats',
  alertChannels: [],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    followRedirects: true,
    skipSsl: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.apiCheckResults').greaterThan(0),
    ],
  }
})
