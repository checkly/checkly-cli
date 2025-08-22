import * as path from 'path'
import { ApiCheck, AssertionBuilder } from 'checkly/constructs'
import { syntheticGroup } from '../utils/website-groups.check'

// API checks work by sending an HTTP request to a URL endpoint. Read more at:
// https://www.checklyhq.com/docs/api-checks/

new ApiCheck('books-api-check-1', {
  name: 'Books API',
  degradedResponseTime: 10000, // milliseconds
  maxResponseTime: 20000,
  setupScript: {
    // API checks can run arbitrary JS/TS code before or after a check. 
    entrypoint: path.join(__dirname, '../utils/setup.ts')
  },
  group: syntheticGroup,
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [   
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers('content-type').equals('application/json; charset=utf-8'),      
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
      AssertionBuilder.jsonBody('$[0].author').equals('Fric Eromm'),
    ],
  },
  runParallel: true,
})
