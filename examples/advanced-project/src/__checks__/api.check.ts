import * as path from 'path'
import { ApiCheck } from 'checkly/constructs'
import { websiteGroup } from './website.check-group'

new ApiCheck('check-group-api-check-1', {
  name: 'Fetch stats for homepage',
  group: websiteGroup,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  setupScript: {
    entrypoint: path.join(__dirname, './utils/setup.ts'),
  },
  request: {
    method: 'GET',
    url: 'https://api.checklyhq.com/public-stats',
    followRedirects: true,
    skipSSL: false,
    assertions: []
  }
})
