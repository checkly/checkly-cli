import { UrlAssertionBuilder, UrlMonitor } from 'checkly/constructs'

// URL Monitors are the simplest and most efficient uptime monitors, they only
// check for the status code of the response.
// Further documentation: https://www.checklyhq.com/docs/url-monitors/

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
