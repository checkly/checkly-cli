import { UrlAssertionBuilder, UrlMonitor } from 'checkly/constructs'

new UrlMonitor('books-url-check', {
  name: 'Books URL',
  activated: true,
  maxResponseTime: 10000,
  degradedResponseTime: 5000,
  request: {
    url: 'https://www.danube-web.shop/',
    followRedirects: true,
    assertions: [
      UrlAssertionBuilder.statusCode().equals(200),
    ]
  }
})
