import { ApiCheck, AssertionBuilder } from 'checkly/constructs'

const apiCheck = new ApiCheck('dummy-check', {
  name: 'Dummy API check',
  alertChannels: [],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
    ],
  },
})
