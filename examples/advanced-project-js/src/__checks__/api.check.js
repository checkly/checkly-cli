const path = require('path');
const { ApiCheck, AssertionBuilder } = require('checkly/constructs');
const { websiteGroup } = require('./website-group.check');

new ApiCheck('books-api-check-1', {
  name: 'Books API',
  group: websiteGroup,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  setupScript: {
    entrypoint: path.join(__dirname, './utils/setup.js'),
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
  },
  runParallel: true,
});
