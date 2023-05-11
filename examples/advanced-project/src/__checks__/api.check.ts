import * as path from 'path'
import { ApiCheck, AssertionBuilder } from 'checkly/constructs'
import { websiteGroup } from './website-group.check'

new ApiCheck('homepage-api-check-1', {
  name: 'Fetch Book List',
  group: websiteGroup,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  setupScript: {
    entrypoint: path.join(__dirname, './utils/setup.ts')
  },
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
    ],
  }
})
