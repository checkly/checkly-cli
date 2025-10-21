import { UrlAssertionBuilder, UrlMonitor } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// URL Monitors are the simplest and most efficient uptime monitors, they only
// check for the status code of the response.
// Further documentation: https://www.checklyhq.com/docs/url-monitors/

new UrlMonitor('homepage-url-check', {
  name: 'Homepage URL Monitor',
  activated: true,
  group: uptimeGroup,
  maxResponseTime: 10000, // milliseconds
  degradedResponseTime: 5000,
  request: {
    url: 'https://www.danube-web.shop/',
    followRedirects: true,
    assertions: [
      UrlAssertionBuilder.statusCode().equals(200),
    ]
  }
})

// In this extension example, we create multiple URL monitors at once

// Here we're using a short array of URLS, but this example can be extended
// by parsing a sitemap or JSON file and adding every URL to an array.
const sitemapUrls = [
  'https://danube-web.shop/books/2',
  'https://danube-web.shop/category?string=economics'
]

sitemapUrls.forEach((url, index) => {
  // Create paths and friendly names for each monitor
  const urlPath = new URL(url).pathname.replace(/\//g, '-').replace(/^-+|-+$/g, '') || 'root'
  const monitorId = `checkly-${urlPath}`
  const monitorName = `${urlPath.replace(/-/g, ' ')} URL monitor`

  // Create each monitor
  new UrlMonitor(monitorId, {
    name: monitorName,
    activated: true,
    group: uptimeGroup, // We'll want to use a group to manage configuration
    request: {
      url: url,
      skipSSL: false,
      followRedirects: true,
      assertions: [
        UrlAssertionBuilder.statusCode().equals(200),
      ]
    }
  })
})
